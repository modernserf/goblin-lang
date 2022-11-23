import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  RedundantTrySendError,
} from "./error"
import {
  Interpreter,
  IRHandler,
  IRStmt,
  ParseStmt,
  PartialHandler,
  Scope,
  Value,
  IRBaseClassBuilder as IIRBaseClassBuilder,
  ParseExpr,
  ParseArg,
  IRExpr,
} from "./interface"
import {
  IRLocalExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
  IRTrySendExpr,
} from "./ir-expr"
import {
  IRConstHandler,
  IROnHandler,
  IRPrimitiveHandler,
  IRValueArg,
} from "./ir-handler"
import { IRClass } from "./value"

// classes

export class IRBaseClassBuilder {
  protected partials = new Map<string, PartialHandler[]>()
  protected handlers = new Map<string, IRHandler>()
  protected elsePartials: PartialHandler[] = []
  protected elseHandler: IRHandler | null = null
  add(selector: string, handler: IRHandler): this {
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    this.handlers.set(selector, handler)
    return this
  }
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
    const partials = this.partials.get(selector) || []
    this.partials.delete(selector)

    const fullBody = partials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    return this.add(selector, getHandler(fullBody))
  }
  addElse(
    selector: string,
    scope: Scope,
    body: ParseStmt[],
    getHandler: (body: IRStmt[]) => IRHandler
  ): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError(selector)
    const fullBody = this.elsePartials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    this.elseHandler = getHandler(fullBody)

    return this
  }
  build(): IRClass {
    if (this.partials.size) throw new Error("incomplete partials")
    return new IRClass(this.handlers, this.elseHandler)
  }
}

export class IRClassBuilder extends IRBaseClassBuilder {
  addPrimitive(
    selector: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    return this.add(selector, new IRPrimitiveHandler(fn))
  }
  addConst(selector: string, value: Value): this {
    return this.add(selector, new IRConstHandler(value))
  }
  buildAndClosePartials(scope: Scope): IRClass {
    if (this.elseHandler) {
      const elseHandler = this.elseHandler
      for (const [key, [value]] of this.partials.entries()) {
        const params = value.params.map((p) => p.toIR())
        // TODO:is there aa better way to do this?
        const args = params.map((_, i) => new IRValueArg(new IRLocalExpr(i)))
        this.addFinal(
          key,
          scope,
          [
            {
              compile: () => [
                new IRSendDirectExpr(key, elseHandler, new IRSelfExpr(), args),
              ],
            },
          ],
          (body) => new IROnHandler(params, body)
        )
      }
    }

    return this.build()
  }
}
export class IRBlockClassBuilder extends IRBaseClassBuilder {}

export class IRSendBuilder {
  constructor(private selector: string, private args: ParseArg[]) {}
  compile(inScope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    // shared between target & args to track borrows
    const argScope = inScope.sendScope()
    const irArgs = this.args.map((v) => v.sendArg(argScope))
    const compiledTarget = target.compile(argScope)
    if (target.getHandler) {
      const handler = target.getHandler(argScope, this.selector)
      // TODO: should this be a warning rather than an error?
      if (orElse) throw new RedundantTrySendError(target, this.selector)
      return new IRSendDirectExpr(
        this.selector,
        handler,
        compiledTarget,
        irArgs
      )
    } else if (orElse) {
      return new IRTrySendExpr(
        this.selector,
        compiledTarget,
        irArgs,
        orElse.compile(inScope)
      )
    } else {
      return new IRSendExpr(this.selector, compiledTarget, irArgs)
    }
  }
}
