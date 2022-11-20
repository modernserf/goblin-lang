import {
  ArgMismatchError,
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  InvalidElseParamsError,
} from "./error"
import {
  Interpreter,
  IRArg,
  IRBlockHandler,
  IRExpr,
  IRHandler,
  IRParam,
  IRStmt,
  ParseStmt,
  PartialHandler,
  Scope,
  Value,
  IRClassBuilder as IIRClassBuilder,
  IRBlockClassBuilder as IIRBlockClassBuilder,
} from "./interface"
import {
  IRClass,
  IRBlockClass,
  DoValue,
  ObjectValue,
  unit,
  IRBaseClass,
} from "./value"

export class IRClassBuilder implements IIRClassBuilder {
  private partials = new Map<string, PartialHandler[]>()
  private handlers = new Map<string, IRHandler>()
  private elseHandler: IRHandler | null = null
  addPartial(selector: string, partial: PartialHandler): this {
    const arr = this.partials.get(selector) || []
    arr.push(partial)
    this.partials.set(selector, arr)
    return this
  }
  addFinal(
    selector: string,
    scope: Scope,
    body: ParseStmt[],
    getHandler: (body: IRStmt[]) => IRHandler
  ): this {
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    const partials = this.partials.get(selector) || []
    this.partials.delete(selector)

    const fullBody = partials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    this.handlers.set(selector, getHandler(fullBody))
    return this
  }
  add(selector: string, handler: IRHandler): this {
    if (this.handlers.has(selector)) {
      throw new DuplicateHandlerError(selector)
    }
    this.handlers.set(selector, handler)
    return this
  }
  addElse(
    selector: string,
    scope: Scope,
    params: IRParam[],
    head: IRStmt[],
    body: ParseStmt[]
  ): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError(selector)
    // TODO: handle partial elses
    const fullBody = body.flatMap((s) => s.compile(scope))
    switch (selector) {
      case "":
        this.elseHandler = new IRElseHandler(head.concat(fullBody))
        return this
      case ":":
        this.elseHandler = new IRForwardMessageHandler(
          params,
          head.concat(fullBody)
        )
        return this
      default:
        throw new InvalidElseParamsError(selector)
    }
  }
  addPrimitive(
    selector: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    /* istanbul ignore next */
    if (this.handlers.has(selector)) {
      throw new DuplicateHandlerError(selector)
    }
    this.handlers.set(selector, new IRPrimitiveHandler(fn))
    return this
  }
  build(): IRClass {
    return new IRBaseClass<IRHandler>(this.handlers, this.elseHandler)
  }
}

export class IRBlockClassBuilder implements IIRBlockClassBuilder {
  private partials = new Map<string, PartialHandler[]>()
  private handlers = new Map<string, IRBlockHandler>()
  private elseHandler: IRBlockHandler | null = null
  addPartial(selector: string, partial: PartialHandler): this {
    const arr = this.partials.get(selector) || []
    arr.push(partial)
    this.partials.set(selector, arr)
    return this
  }
  addFinal(
    selector: string,
    offset: number,
    scope: Scope,
    params: IRParam[],
    head: IRStmt[],
    body: ParseStmt[]
  ): this {
    if (this.handlers.has(selector)) {
      throw new DuplicateHandlerError(selector)
    }
    const partials = this.partials.get(selector) || []
    this.partials.delete(selector)

    const fullBody = partials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    this.handlers.set(
      selector,
      new IROnBlockHandler(offset, params, [...head, ...fullBody])
    )
    return this
  }
  add(
    selector: string,
    offset: number,
    params: IRParam[],
    body: IRStmt[]
  ): this {
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    this.handlers.set(selector, new IROnBlockHandler(offset, params, body))
    return this
  }
  addElse(body: IRStmt[]): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError("")
    this.elseHandler = new IRElseBlockHandler(body)
    return this
  }
  build(): IRBlockClass {
    return new IRBaseClass<IRBlockHandler>(this.handlers, this.elseHandler)
  }
}

export class IRValueArg implements IRArg {
  constructor(private expr: IRExpr) {}
  value(ctx: Interpreter): Value {
    return this.expr.eval(ctx)
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag === "var") throw new ArgMismatchError(param.tag, "value")
    target.setLocal(offset, this.expr.eval(sender))
  }
  unload() {} // noop
}

export class IRVarArg implements IRArg {
  constructor(private index: number) {}
  /* istanbul ignore next */
  value(ctx: Interpreter): Value {
    throw "todo: handle var args in primitive fns"
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag !== "var") throw new ArgMismatchError(param.tag, "var")
    target.setLocal(offset, sender.getLocal(this.index))
  }
  unload(sender: Interpreter, target: Interpreter, offset: number): void {
    const result = target.getLocal(offset)
    sender.setLocal(this.index, result)
  }
}

export class IRDoArg implements IRArg {
  constructor(private cls: IRBlockClass) {}
  value(ctx: Interpreter): Value {
    return new DoValue(this.cls, ctx)
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag !== "do") throw new ArgMismatchError(param.tag, "do")
    target.setLocal(offset, new DoValue(this.cls, sender))
  }
  unload() {} // noop
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
    /* istanbul ignore next */
    if (!param) throw new Error("missing param")
    arg.load(sender, target, offset + i, param)
  })
}

function unloadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    arg.unload(sender, target, offset + i)
  })
}

export class IRLazyHandler implements IRHandler {
  private handler: IRHandler | null = null
  replace(handler: IRHandler) {
    this.handler = handler
  }
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    if (!this.handler) throw new Error("missing lazy handler")
    return this.handler.send(sender, target, selector, args)
  }
}

function messageForwarder(selector: string, args: IRArg[]): IRExpr {
  const cls = new IRClassBuilder()
    .addPrimitive(":", (_, [receiver], ctx) => {
      return receiver.send(ctx, selector, args)
    })
    .build()
  return new ObjectValue(cls, [])
}

export class IRElseHandler implements IRHandler {
  constructor(private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const child = sender.createChild(target)
    return Return.handleReturn(child, () => body(child, this.body))
  }
}

export class IRForwardMessageHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    originalArgs: IRArg[]
  ): Value {
    const args = [new IRValueArg(messageForwarder(selector, originalArgs))]
    const child = sender.createChild(target)
    loadArgs(sender, child, 0, this.params, args)
    try {
      return Return.handleReturn(child, () => body(child, this.body))
    } finally {
      unloadArgs(sender, child, 0, args)
    }
  }
}

export class IRObjectHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const child = sender.createChild(target)
    loadArgs(sender, child, 0, this.params, args)
    try {
      return Return.handleReturn(child, () => body(child, this.body))
    } finally {
      unloadArgs(sender, child, 0, args)
    }
  }
}

export class IRPrimitiveHandler implements IRHandler {
  constructor(
    private fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    return this.fn(
      target.primitiveValue,
      args.map((arg) => arg.value(sender)),
      sender
    )
  }
}

export class IRElseBlockHandler implements IRBlockHandler {
  constructor(private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    ctx: Interpreter,
    selector: string,
    args: IRArg[]
  ): Value {
    return body(ctx, this.body)
  }
}

export class IROnBlockHandler implements IRBlockHandler {
  constructor(
    private offset: number,
    private params: IRParam[],
    private body: IRStmt[]
  ) {}
  send(
    sender: Interpreter,
    ctx: Interpreter,
    selector: string,
    args: IRArg[]
  ): Value {
    loadArgs(sender, ctx, this.offset, this.params, args)
    const result = body(ctx, this.body)
    unloadArgs(sender, ctx, this.offset, args)
    return result
  }
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
    private args: IRArg[]
  ) {}
  eval(ctx: Interpreter): Value {
    const target = this.target.eval(ctx)
    return target.send(ctx, this.selector, this.args)
  }
}

export class IRTrySendExpr implements IRExpr, IRStmt {
  constructor(
    private selector: string,
    private target: IRExpr,
    private args: IRArg[],
    private orElse: IRExpr
  ) {}
  eval(ctx: Interpreter): Value {
    const target = this.target.eval(ctx)
    return target.trySend(ctx, this.selector, this.args, this.orElse)
  }
}

export class IRSendDirectExpr implements IRExpr, IRStmt {
  constructor(
    private selector: string,
    private handler: IRHandler,
    private target: IRExpr,
    private args: IRArg[]
  ) {}
  eval(ctx: Interpreter): Value {
    return this.handler.send(
      ctx,
      this.target.eval(ctx),
      this.selector,
      this.args
    )
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

export function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result: Value = unit
  try {
    for (const stmt of stmts) {
      result = stmt.eval(ctx) || unit
    }
    return result
  } finally {
    ctx.resolveDefers()
  }
}
