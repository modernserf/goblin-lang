export type IRModules = Map<string, IRStmt[]>

export type IRStmt =
  | { tag: "assign"; index: number; value: IRExpr }
  | { tag: "return"; value: IRExpr }
  | { tag: "expr"; value: IRExpr }
  | { tag: "provide"; key: string; value: IRExpr }
  | { tag: "defer"; body: IRStmt[] }

export type IRArg =
  | { tag: "value"; value: IRExpr }
  | { tag: "var"; index: number }
  | { tag: "do"; class: IRBlockClass }

export class IRClass {
  constructor(
    private handlers: Map<string, IRHandler> = new Map(),
    private elseHandler: IRHandler | null = null
  ) {}
  get(selector: string): IRHandler {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    throw new NoHandlerError(selector)
  }
  add(selector: string, handler: IRHandler): this {
    /* istanbul ignore next */
    if (this.handlers.has(selector)) {
      throw new Error(`duplicate selector: ${selector}`)
    }
    this.handlers.set(selector, handler)
    return this
  }
  addElse(handler: IRHandler): this {
    /* istanbul ignore next */
    if (this.elseHandler) {
      throw new Error(`duplicate else handler`)
    }
    this.elseHandler = handler
    return this
  }
  addPrimitive(
    selector: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    /* istanbul ignore next */
    if (this.handlers.has(selector)) {
      throw new Error(`duplicate selector: ${selector}`)
    }
    this.handlers.set(selector, { tag: "primitive", fn })
    return this
  }
}

export type IRHandler =
  | { tag: "object"; body: IRStmt[]; params: IRParam[] }
  | { tag: "primitive"; fn: IRPrimitiveHandler }
type IRPrimitiveHandler = (
  value: PrimitiveValue,
  args: Value[],
  ctx: Interpreter
) => Value

export type IRParam = { tag: "value" } | { tag: "var" } | { tag: "do" }

export type IRBlockClass = {
  handlers: Map<string, IRBlockHandler>
  else: IRBlockHandler | null
}
export type IRBlockHandler = {
  body: IRStmt[]
  offset: number
  params: IRParam[]
}

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "do"; class: IRBlockClass; ctx: Interpreter }
  | { tag: "primitive"; class: IRClass; value: PrimitiveValue }
type PrimitiveValue = any

// TODO: RuntimeError base class
export class NoHandlerError {
  constructor(readonly selector: string) {}
}
export class NoProviderError {
  constructor(readonly key: string) {}
}

export const unitClass: IRClass = new IRClass()
export const unit: Value = { tag: "object", class: unitClass, ivars: [] }

export class Modules {
  private cache = new Map<string, Value>()
  private circularRefs = new Set<string>()
  constructor(private sources: IRModules) {}
  get(key: string): Value {
    const cached = this.cache.get(key)
    if (cached) return cached

    /* istanbul ignore next */
    if (this.circularRefs.has(key)) throw "circular ref"
    this.circularRefs.add(key)

    const source = this.sources.get(key)
    /* istanbul ignore next */
    if (!source) throw "no such module"

    const ctx = new Interpreter(unit, new Map(), this)
    const result: Value = body(ctx, source)
    this.cache.set(key, result)
    return result
  }
}

export class Interpreter {
  static root(moduleSources: Map<string, IRStmt[]>): Interpreter {
    return new Interpreter(unit, new Map(), new Modules(moduleSources))
  }
  private locals: Value[] = []
  constructor(
    readonly self: Value,
    private provideScope: Map<string, Value>,
    private modules: Modules
  ) {}
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getLocal(index: number): Value {
    const result = this.locals[index]
    /* istanbul ignore next */
    if (!result) {
      throw new Error(`missing local ${index}`)
    }
    return result
  }
  getIvar(index: number): Value {
    /* istanbul ignore next */
    if (this.self.tag !== "object") {
      throw new Error("getIvar should be unreachable")
    }
    return this.self.ivars[index]
  }
  use(key: string): Value {
    const res = this.provideScope.get(key)
    if (!res) throw new NoProviderError(key)
    return res
  }
  provide(key: string, value: Value) {
    const next = new Map(this.provideScope)
    next.set(key, value)
    this.provideScope = next
  }
  createChild(self: Value): Interpreter {
    return new Interpreter(self, this.provideScope, this.modules)
  }
  getModule(key: string) {
    return this.modules.get(key)
  }
}

export class ArgMismatchError {
  constructor(readonly paramType: string, readonly argType: string) {}
}

function loadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  params: IRParam[],
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    const param = params[i]
    // TODO: is else sent with fewer params than args?
    /* istanbul ignore next */
    if (!param) throw new Error("missing param")
    switch (arg.tag) {
      case "value": {
        if (param.tag === "var") throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, arg.value.eval(sender))
        return
      }
      case "var": {
        if (param.tag !== "var") throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, sender.getLocal(arg.index))
        return
      }
      case "do": {
        if (param.tag !== "do") throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, {
          tag: "do",
          class: arg.class,
          ctx: sender,
        })
        return
      }
    }
  })
}

function unloadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    if (arg.tag === "var") {
      const result = target.getLocal(offset + i)
      sender.setLocal(arg.index, result)
    }
  })
}

function sendHandler(
  sender: Interpreter,
  target: Value,
  handler: IRHandler,
  args: IRArg[]
): Value {
  switch (handler.tag) {
    case "primitive": {
      const targetValue = target.tag === "primitive" ? target.value : null
      const argValues = args.map((arg) => {
        switch (arg.tag) {
          case "value":
            return arg.value.eval(sender)
          case "do":
            return { tag: "do", class: arg.class, ctx: sender } as const
          /* istanbul ignore next */
          default:
            throw "todo: handle var args in primitive fns"
        }
      })
      return handler.fn(targetValue, argValues, sender)
    }
    case "object":
      const child = sender.createChild(target)
      loadArgs(sender, child, 0, handler.params, args)
      try {
        const result = Return.handleReturn(child, () =>
          body(child, handler.body)
        )
        return result
      } finally {
        unloadArgs(sender, child, 0, args)
      }
  }
}

export function send(
  sender: Interpreter,
  selector: string,
  target: Value,
  args: IRArg[]
): Value {
  if (target.tag === "do") {
    const ctx = target.ctx
    const handler = target.class.handlers.get(selector)
    if (!handler) {
      if (target.class.else) {
        return body(ctx, target.class.else.body)
      }
      throw new NoHandlerError(selector)
    }

    loadArgs(sender, ctx, handler.offset, handler.params, args)
    const result = body(ctx, handler.body)
    unloadArgs(sender, ctx, handler.offset, args)
    return result
  }

  const handler = target.class.get(selector)
  return sendHandler(sender, target, handler, args)
}

export interface IRExpr {
  eval(ctx: Interpreter): Value
}

export class IRSelfExpr implements IRExpr {
  eval(ctx: Interpreter): Value {
    return ctx.self
  }
}
// TODO: Value implements IRExpr directly
export class IRConstantExpr implements IRExpr {
  constructor(readonly value: Value) {}
  eval(ctx: Interpreter): Value {
    return this.value
  }
}

export class IRIvarExpr implements IRExpr {
  constructor(private index: number) {}
  eval(ctx: Interpreter): Value {
    return ctx.getIvar(this.index)
  }
}

export class IRLocalExpr implements IRExpr {
  constructor(private index: number) {}
  eval(ctx: Interpreter): Value {
    return ctx.getLocal(this.index)
  }
}

export class IRObjectExpr implements IRExpr {
  constructor(private cls: IRClass, private ivars: IRExpr[]) {}
  eval(ctx: Interpreter): Value {
    return {
      tag: "object",
      class: this.cls,
      ivars: this.ivars.map((ivar) => ivar.eval(ctx)),
    }
  }
}

export class IRSendExpr implements IRExpr {
  constructor(
    private selector: string,
    private target: IRExpr,
    private args: IRArg[]
  ) {}
  eval(ctx: Interpreter): Value {
    // TODO: inline send
    return send(ctx, this.selector, this.target.eval(ctx), this.args)
  }
}

export class IRSendDirectExpr implements IRExpr {
  constructor(
    private handler: IRHandler,
    private target: IRExpr,
    private args: IRArg[]
  ) {}
  eval(ctx: Interpreter): Value {
    return sendHandler(ctx, this.target.eval(ctx), this.handler, this.args)
  }
}

export class IRUseExpr implements IRExpr {
  constructor(private key: string) {}
  eval(ctx: Interpreter): Value {
    return ctx.use(this.key)
  }
}

export class IRModuleExpr implements IRExpr {
  constructor(private key: string) {}
  eval(ctx: Interpreter): Value {
    return ctx.getModule(this.key)
  }
}

class Return {
  constructor(private ctx: object, private value: Value) {}
  static handleReturn(ctx: object, fn: () => Value): Value {
    try {
      return fn()
    } catch (e) {
      if (e instanceof Return && e.ctx === ctx) {
        return e.value
      } else {
        throw e
      }
    }
  }
}

function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result = unit
  const defers: IRStmt[][] = []
  try {
    for (const stmt of stmts) {
      switch (stmt.tag) {
        case "assign":
          ctx.setLocal(stmt.index, stmt.value.eval(ctx))
          break
        case "return":
          throw new Return(ctx, stmt.value.eval(ctx))
        case "expr":
          result = stmt.value.eval(ctx)
          break
        case "provide":
          ctx.provide(stmt.key, stmt.value.eval(ctx))
          break
        case "defer":
          defers.push(stmt.body)
          break
      }
    }
    return result
  } finally {
    for (const defer of defers) {
      body(ctx, defer)
    }
  }
}

export function program(stmts: IRStmt[], modules: IRModules): Value {
  const ctx = Interpreter.root(modules)
  return body(ctx, stmts)
}
