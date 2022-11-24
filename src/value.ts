import {
  DuplicateHandlerError,
  NoHandlerError,
  UnreachableError,
} from "./error"
import {
  Interpreter,
  IRArg,
  IRExpr,
  IRHandler,
  IRStmt,
  Value,
} from "./interface"
import { IRConstHandler } from "./ir-handler"

export class IRClass {
  constructor(
    private handlers: Map<string, IRHandler>,
    private elseHandler: IRHandler | null
  ) {}
  add(selector: string, handler: IRHandler): this {
    /* istanbul ignore next */
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    this.handlers.set(selector, handler)
    return this
  }
  try(selector: string): IRHandler | null {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    return null
  }
  get(selector: string): IRHandler {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    throw new NoHandlerError(selector)
  }
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
  send(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr | null
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, selector, args)
    if (orElse) return orElse.eval(sender)
    throw new NoHandlerError(selector)
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
  context(sender: Interpreter): Interpreter {
    return sender.createChild(this)
  }
}

export class PrimitiveValue implements Value, IRExpr, IRStmt {
  constructor(private cls: IRClass, readonly primitiveValue: any) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new UnreachableError("primitive value does not access ivars")
  }
  send(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr | null
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, selector, args)
    if (orElse) return orElse.eval(sender)
    throw new NoHandlerError(selector)
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
  context(sender: Interpreter): Interpreter {
    return sender.createChild(this)
  }
}

export class DoValue implements Value {
  readonly primitiveValue = null
  constructor(private cls: IRClass, private ctx: Interpreter) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new UnreachableError("do value does not access ivars")
  }
  send(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr | null
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, selector, args)
    if (orElse) return orElse.eval(sender)
    throw new NoHandlerError(selector)
  }
  instanceof(cls: IRClass): boolean {
    return false
  }
  /* istanbul ignore next */
  eval(ctx: Interpreter): Value {
    throw new UnreachableError("do value is not used as IRExpr")
  }
  context(): Interpreter {
    return this.ctx
  }
}

export const unitClass = new IRClass(new Map(), null)
export const unit = new ObjectValue(unitClass, [])
