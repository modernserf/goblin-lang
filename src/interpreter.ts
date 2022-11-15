export type IRModules = Map<string, IRStmt[]>

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
  addFrame(selector: string, params: IRParam[], body: IRStmt[]): this {
    // allow overwriting of methods
    this.handlers.set(selector, new IRObjectHandler(params, body))
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
    this.handlers.set(selector, new IRPrimitiveHandler(fn))
    return this
  }
}

export type IRParam = { tag: "value" } | { tag: "var" } | { tag: "do" }

export interface Value {
  readonly primitiveValue: any
  getIvar(index: number): Value
  send(sender: Interpreter, selector: string, args: IRArgs): Value
  instanceof(cls: IRClass | IRBlockClass): boolean
  eval(ctx: Interpreter): Value
}

export class ObjectValue implements Value, IRExpr, IRStmt {
  readonly primitiveValue = null
  constructor(private cls: IRClass, private ivars: Value[]) {}
  getIvar(index: number): Value {
    const value = this.ivars[index]
    /* istanbul ignore next */
    if (!value) throw new Error(`Missing ivar ${index}`)
    return value
  }
  send(sender: Interpreter, selector: string, args: IRArgs): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, args)
  }
  instanceof(cls: IRClass): boolean {
    return this.cls === cls
  }
  eval(ctx: Interpreter): Value {
    return this
  }
}

export class PrimitiveValue implements Value, IRExpr, IRStmt {
  constructor(private cls: IRClass, readonly primitiveValue: any) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new Error("primitive value has no ivars")
  }
  send(sender: Interpreter, selector: string, args: IRArgs): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, args)
  }
  instanceof(cls: IRClass): boolean {
    return this.cls === cls
  }
  eval(ctx: Interpreter): Value {
    return this
  }
}

export class DoValue implements Value, IRExpr, IRStmt {
  readonly primitiveValue = null
  constructor(private cls: IRBlockClass, private ctx: Interpreter) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new Error("do value has no ivars")
  }
  send(sender: Interpreter, selector: string, args: IRArgs): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this.ctx, args)
  }
  /* istanbul ignore next */
  instanceof(cls: IRClass): boolean {
    return false
  }
  eval(ctx: Interpreter): Value {
    return this
  }
}

// TODO: RuntimeError base class
export class NoHandlerError {
  constructor(readonly selector: string) {}
}
export class NoProviderError {
  constructor(readonly key: string) {}
}

export const unitClass: IRClass = new IRClass()
export const unit: Value = new ObjectValue(unitClass, [])

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
  private defers: IRStmt[][] = []
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
    return this.self.getIvar(index)
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
  defer(value: IRStmt[]) {
    this.defers.push(value)
  }
  // TODO: this feels a little janky
  resolveDefers() {
    const defers = this.defers.reverse()
    this.defers = []
    for (const defer of defers) {
      body(this, defer)
    }
    this.defers = []
  }
}

export class ArgMismatchError {
  constructor(readonly paramType: string, readonly argType: string) {}
}

export type IRArg =
  | { tag: "value"; value: IRExpr }
  | { tag: "var"; index: number }
  | { tag: "do"; class: IRBlockClass }

type IRArgs = IRArg[]
// type IRArgs = {}

function argValues(sender: Interpreter, args: IRArgs) {
  return args.map((arg) => {
    switch (arg.tag) {
      case "value":
        return arg.value.eval(sender)
      case "do":
        return new DoValue(arg.class, sender)
      /* istanbul ignore next */
      default:
        throw "todo: handle var args in primitive fns"
    }
  })
}

function loadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  params: IRParam[],
  args: IRArgs
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
        target.setLocal(offset + i, new DoValue(arg.class, sender))
        return
      }
    }
  })
}

function unloadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  args: IRArgs
) {
  args.forEach((arg, i) => {
    if (arg.tag === "var") {
      const result = target.getLocal(offset + i)
      sender.setLocal(arg.index, result)
    }
  })
}

export interface IRHandler {
  send(sender: Interpreter, target: Value, args: IRArgs): Value
}
export class IRLazyHandler implements IRHandler {
  private handler: IRHandler | null = null
  replace(handler: IRHandler) {
    this.handler = handler
  }
  send(sender: Interpreter, target: Value, args: IRArgs): Value {
    if (!this.handler) throw new Error("missing lazy handler")
    return this.handler.send(sender, target, args)
  }
}

export class IRObjectHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(sender: Interpreter, target: Value, args: IRArgs): Value {
    const child = sender.createChild(target)
    loadArgs(sender, child, 0, this.params, args)
    try {
      const result = Return.handleReturn(child, () => body(child, this.body))
      return result
    } finally {
      unloadArgs(sender, child, 0, args)
    }
  }
}

export class IRPrimitiveHandler implements IRHandler {
  constructor(
    private fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ) {}
  send(sender: Interpreter, target: Value, args: IRArgs): Value {
    return this.fn(target.primitiveValue, argValues(sender, args), sender)
  }
}

export class IRBlockClass {
  constructor(
    private handlers: Map<string, IRBlockHandler> = new Map(),
    private elseHandler: IRBlockHandler | null = null
  ) {}
  add(
    selector: string,
    offset: number,
    params: IRParam[],
    body: IRStmt[]
  ): this {
    /* istanbul ignore next */
    if (this.handlers.has(selector)) {
      throw new Error(`duplicate selector: ${selector}`)
    }
    this.handlers.set(selector, new IROnBlockHandler(offset, params, body))
    return this
  }
  addElse(body: IRStmt[]): this {
    /* istanbul ignore next */
    if (this.elseHandler) {
      throw new Error(`duplicate else handler`)
    }
    this.elseHandler = new IRElseBlockHandler(body)
    return this
  }
  get(selector: string) {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    throw new NoHandlerError(selector)
  }
}

export interface IRBlockHandler {
  send(sender: Interpreter, ctx: Interpreter, args: IRArgs): Value
}

class IRElseBlockHandler implements IRBlockHandler {
  constructor(private body: IRStmt[]) {}
  send(sender: Interpreter, ctx: Interpreter, args: IRArgs): Value {
    return body(ctx, this.body)
  }
}

class IROnBlockHandler implements IRBlockHandler {
  constructor(
    private offset: number,
    private params: IRParam[],
    private body: IRStmt[]
  ) {}
  send(sender: Interpreter, ctx: Interpreter, args: IRArgs): Value {
    loadArgs(sender, ctx, this.offset, this.params, args)
    const result = body(ctx, this.body)
    unloadArgs(sender, ctx, this.offset, args)
    return result
  }
}

export interface IRExpr {
  eval(ctx: Interpreter): Value
}

export class IRSelfExpr implements IRExpr, IRStmt {
  eval(ctx: Interpreter): Value {
    return ctx.self
  }
}

export class IRIvarExpr implements IRExpr, IRStmt {
  constructor(private index: number) {}
  eval(ctx: Interpreter): Value {
    return ctx.getIvar(this.index)
  }
}

export class IRLocalExpr implements IRExpr, IRStmt {
  constructor(private index: number) {}
  eval(ctx: Interpreter): Value {
    return ctx.getLocal(this.index)
  }
}

export class IRObjectExpr implements IRExpr, IRStmt {
  constructor(private cls: IRClass, private ivars: IRExpr[]) {}
  eval(ctx: Interpreter): Value {
    return new ObjectValue(
      this.cls,
      this.ivars.map((ivar) => ivar.eval(ctx))
    )
  }
}

export class IRSendExpr implements IRExpr, IRStmt {
  constructor(
    private selector: string,
    private target: IRExpr,
    private args: IRArgs
  ) {}
  eval(ctx: Interpreter): Value {
    const target = this.target.eval(ctx)
    return target.send(ctx, this.selector, this.args)
  }
}

export class IRSendDirectExpr implements IRExpr, IRStmt {
  constructor(
    private handler: IRHandler,
    private target: IRExpr,
    private args: IRArgs
  ) {}
  eval(ctx: Interpreter): Value {
    return this.handler.send(ctx, this.target.eval(ctx), this.args)
  }
}

export class IRUseExpr implements IRExpr, IRStmt {
  constructor(private key: string) {}
  eval(ctx: Interpreter): Value {
    return ctx.use(this.key)
  }
}

export class IRModuleExpr implements IRExpr, IRStmt {
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

export interface IRStmt {
  eval(ctx: Interpreter): void | Value
}

export class IRAssignStmt implements IRStmt {
  constructor(private index: number, private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    ctx.setLocal(this.index, this.value.eval(ctx))
  }
}

export class IRReturnStmt implements IRStmt {
  constructor(private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    throw new Return(ctx, this.value.eval(ctx))
  }
}

export class IRProvideStmt implements IRStmt {
  constructor(private key: string, private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    ctx.provide(this.key, this.value.eval(ctx))
  }
}

export class IRDeferStmt implements IRStmt {
  constructor(private body: IRStmt[]) {}
  eval(ctx: Interpreter): void | Value {
    ctx.defer(this.body)
  }
}

function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result = unit
  try {
    for (const stmt of stmts) {
      result = stmt.eval(ctx) || unit
    }
    return result
  } finally {
    ctx.resolveDefers()
  }
}

export function program(stmts: IRStmt[], modules: IRModules): Value {
  const ctx = Interpreter.root(modules)
  return body(ctx, stmts)
}
