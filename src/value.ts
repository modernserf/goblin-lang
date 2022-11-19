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

export class IRClass {
  constructor(
    protected handlers: Map<string, IRHandler> = new Map(),
    protected elseHandler: IRHandler | null = null
  ) {}
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

export class IRBlockClass {
  constructor(
    protected handlers: Map<string, IRBlockHandler> = new Map(),
    protected elseHandler: IRBlockHandler | null = null
  ) {}
  get(selector: string): IRBlockHandler {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    throw new NoHandlerError(selector)
  }
  try(selector: string): IRBlockHandler | null {
    const handler = this.handlers.get(selector)
    if (handler) return handler
    if (this.elseHandler) return this.elseHandler
    return null
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
  send(sender: Interpreter, selector: string, args: IRArg[]): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, args)
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
}

export class PrimitiveValue implements Value, IRExpr, IRStmt {
  constructor(private cls: IRClass, readonly primitiveValue: any) {}
  /* istanbul ignore next */
  getIvar(index: number): Value {
    throw new Error("primitive value has no ivars")
  }
  send(sender: Interpreter, selector: string, args: IRArg[]): Value {
    const handler = this.cls.get(selector)
    return handler.send(sender, this, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this, args)
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
    return handler.send(sender, this.ctx, args)
  }
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value {
    const handler = this.cls.try(selector)
    if (handler) return handler.send(sender, this.ctx, args)
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
}

export const unitClass: IRClass = new IRClass()
export const unit = new ObjectValue(unitClass, [])
