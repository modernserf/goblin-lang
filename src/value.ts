import { NoHandlerError } from "./error"
import {
  Interpreter,
  IRArg,
  IRBlockHandler,
  IRExpr,
  IRHandler,
  IRStmt,
  Value,
} from "./interface"
import { IRConstHandler } from "./ir"

export class IRBaseClass<Handler> {
  constructor(
    protected handlers: Map<string, Handler> = new Map(),
    protected elseHandler: Handler | null = null
  ) {}
  try(selector: string): Handler | null {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    return null
  }
  get(selector: string): Handler {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    throw new NoHandlerError(selector)
  }
}

export type IRClass = IRBaseClass<IRHandler>
export type IRBlockClass = IRBaseClass<IRBlockHandler>

export class ObjectValue implements Value, IRExpr, IRStmt {
  readonly primitiveValue = null
  constructor(private cls: IRClass, private ivars: Value[]) {}
  getIvar(index: number): Value {
    const value = this.ivars[index]
    /* istanbul ignore next */
    if (!value) throw new Error(`Missing ivar ${index}`)
    return value
  }
  send(sender: Interpreter, selector: string, args: IRArg[]): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, selector, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, selector, args)
    return orElse.eval(sender)
  }
  instanceof(cls: IRClass): boolean {
    return this.cls === cls
  }
  eval(ctx: Interpreter): Value {
    return this
  }
  const(): Value {
    return this
  }
  toHandler(): IRHandler {
    return new IRConstHandler(this)
  }
}

export class PrimitiveValue implements Value, IRExpr, IRStmt {
  constructor(private cls: IRClass, readonly primitiveValue: any) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new Error("primitive value has no ivars")
  }
  send(sender: Interpreter, selector: string, args: IRArg[]): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, selector, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, selector, args)
    return orElse.eval(sender)
  }
  instanceof(cls: IRClass): boolean {
    return this.cls === cls
  }
  eval(ctx: Interpreter): Value {
    return this
  }
  const(): Value {
    return this
  }
  toHandler(): IRHandler {
    return new IRConstHandler(this)
  }
}

export class DoValue implements Value {
  readonly primitiveValue = null
  constructor(private cls: IRBlockClass, private ctx: Interpreter) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new Error("do value has no ivars")
  }
  send(sender: Interpreter, selector: string, args: IRArg[]): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this.ctx, selector, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this.ctx, selector, args)
    return orElse.eval(sender)
  }
  /* istanbul ignore next */
  instanceof(cls: IRClass): boolean {
    throw new Error("unreachable")
  }
  /* istanbul ignore next */
  const(): Value {
    throw new Error("unreachable")
  }
  eval(ctx: Interpreter): Value {
    return this
  }
}

export const unitClass = new IRBaseClass<IRHandler>()
export const unit = new ObjectValue(unitClass, [])
