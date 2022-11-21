import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  RedundantTrySendError,
} from "./error"
import { Self } from "./expr"
import {
  Interpreter,
  IRBlockHandler,
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
import { IRBaseClass } from "./value"

// classes

export class IRBaseClassBuilder<Handler>
  implements IIRBaseClassBuilder<Handler>
{
  protected partials = new Map<string, PartialHandler[]>()
  protected handlers = new Map<string, Handler>()
  protected elsePartials: PartialHandler[] = []
  protected elseHandler: Handler | null = null
  add(selector: string, handler: Handler): this {
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
    getHandler: (body: IRStmt[]) => Handler
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
    getHandler: (body: IRStmt[]) => Handler
  ): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError(selector)
    const fullBody = this.elsePartials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    this.elseHandler = getHandler(fullBody)

    return this
  }
  build(): IRBaseClass<Handler> {
    if (this.partials.size) throw new Error("incomplete partials")
    return new IRBaseClass<Handler>(this.handlers, this.elseHandler)
  }
}

export class IRClassBuilder extends IRBaseClassBuilder<IRHandler> {
  addPrimitive(
    selector: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    return this.add(selector, new IRPrimitiveHandler(fn))
  }
  addConst(selector: string, value: Value): this {
    return this.add(selector, new IRConstHandler(value))
  }
  buildAndClosePartials(scope: Scope): IRBaseClass<IRHandler> {
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
export class IRBlockClassBuilder extends IRBaseClassBuilder<IRBlockHandler> {}

export class IRSendBuilder {
  constructor(private selector: string, private args: ParseArg[]) {}
  compile(inScope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    return compileSend(inScope, this.selector, target, this.args, orElse)
  }
}

function compileSend(
  inScope: Scope,
  selector: string,
  target: ParseExpr,
  astArgs: ParseArg[],
  orElse: ParseExpr | null
) {
  // shared between args to track borrows
  const scope: Scope = inScope.sendScope()
  const irArgs = astArgs.map((v) => v.sendArg(scope))
  if (target === Self) {
    const handler = scope.instance.getPlaceholderHandler(selector)
    if (orElse) {
      // TODO: make this a "warning" rather than an "error"
      throw new RedundantTrySendError()
    }
    return new IRSendDirectExpr(selector, handler, new IRSelfExpr(), irArgs)
  } else {
    if (orElse) {
      return new IRTrySendExpr(
        selector,
        target.compile(scope),
        irArgs,
        orElse.compile(scope)
      )
    } else {
      return new IRSendExpr(selector, target.compile(scope), irArgs)
    }
  }
}
