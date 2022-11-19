import {
  ArgMismatchError,
  DuplicateElseHandlerError,
  DuplicateHandlerError,
} from "./error"
import {
  Interpreter,
  IRArg,
  IRBlockHandler,
  IRExpr,
  IRHandler,
  IRParam,
  IRStmt,
  Value,
} from "./interface"
import { IRClass, IRBlockClass, DoValue, ObjectValue, unit } from "./value"

export class IRClassBuilder {
  constructor(
    protected handlers: Map<string, IRHandler> = new Map(),
    protected elseHandler: IRHandler | null = null
  ) {}
  add(selector: string, handler: IRHandler): this {
    if (this.handlers.has(selector)) {
      throw new DuplicateHandlerError(selector)
    }
    this.handlers.set(selector, handler)
    return this
  }
  addElse(body: IRStmt[]): this {
    if (this.elseHandler) {
      throw new DuplicateElseHandlerError()
    }
    this.elseHandler = new IRElseHandler(body)
    return this
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
    return new IRClass(this.handlers, this.elseHandler)
  }
}

export class IRBlockClassBuilder extends IRBlockClass {
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
    if (this.elseHandler) throw new DuplicateElseHandlerError()
    this.elseHandler = new IRElseBlockHandler(body)
    return this
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
  send(sender: Interpreter, target: Value, args: IRArg[]): Value {
    if (!this.handler) throw new Error("missing lazy handler")
    return this.handler.send(sender, target, args)
  }
}

export class IRElseHandler implements IRHandler {
  constructor(private body: IRStmt[]) {}
  send(sender: Interpreter, target: Value, args: IRArg[]): Value {
    const child = sender.createChild(target)
    return Return.handleReturn(child, () => body(child, this.body))
  }
}

export class IRObjectHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(sender: Interpreter, target: Value, args: IRArg[]): Value {
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
  send(sender: Interpreter, target: Value, args: IRArg[]): Value {
    return this.fn(
      target.primitiveValue,
      args.map((arg) => arg.value(sender)),
      sender
    )
  }
}

export class IRElseBlockHandler implements IRBlockHandler {
  constructor(private body: IRStmt[]) {}
  send(sender: Interpreter, ctx: Interpreter, args: IRArg[]): Value {
    return body(ctx, this.body)
  }
}

export class IROnBlockHandler implements IRBlockHandler {
  constructor(
    private offset: number,
    private params: IRParam[],
    private body: IRStmt[]
  ) {}
  send(sender: Interpreter, ctx: Interpreter, args: IRArg[]): Value {
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
    private handler: IRHandler,
    private target: IRExpr,
    private args: IRArg[]
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
