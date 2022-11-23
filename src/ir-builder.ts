import { RedundantTrySendError } from "./error"
import { Scope, ParseExpr, ParseArg, IRExpr } from "./interface"
import { IRSendDirectExpr, IRSendExpr, IRTrySendExpr } from "./ir-expr"

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
