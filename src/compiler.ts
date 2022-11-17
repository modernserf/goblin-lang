import {
  ASTLetBinding,
  ParseStmt,
  Instance,
  ParseExpr,
  ParseArg,
} from "./interface"
import {
  IRSendExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRAssignStmt,
  IRTrySendExpr,
} from "./interpreter"
import { SendScope, RootScope } from "./scope"
import { IRExpr, IRStmt, Value, Locals, Scope, ScopeRecord } from "./interface"
import { Self } from "./expr"

class Send {
  private scope = new SendScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  send(
    selector: string,
    astTarget: ParseExpr,
    astArgs: ParseArg[],
    orElse: ParseExpr | null = null
  ): IRExpr {
    const args = astArgs.map((v) => v.sendArg(this.scope))
    if (astTarget === Self) {
      const handler = this.instance.getPlaceholderHandler(selector)
      if (orElse) {
        throw new Error("trySend must be unneccessary on self")
      }
      return new IRSendDirectExpr(handler, new IRSelfExpr(), args)
    } else {
      const target = astTarget.compile(this.scope)
      if (orElse) {
        return new IRTrySendExpr(
          selector,
          astTarget.compile(this.scope),
          args,
          orElse.compile(this.scope)
        )
      } else {
        return new IRSendExpr(selector, target, args)
      }
    }
  }
}

export function compileSend(
  scope: Scope,
  selector: string,
  target: ParseExpr,
  args: ParseArg[],
  orElse: ParseExpr | null = null
) {
  return new Send(scope.instance, scope.locals).send(
    selector,
    target,
    args,
    orElse
  )
}

class Let {
  constructor(private locals: Locals) {}
  compile(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    switch (binding.tag) {
      case "identifier": {
        const record = this.useLet(binding.value)
        return [new IRAssignStmt(record.index, value)]
      }
      case "object":
        const record = this.useAs(binding.as)
        return [
          new IRAssignStmt(record.index, value),
          ...binding.params.flatMap((param) =>
            this.compile(param.value, new IRSendExpr(param.key, value, []))
          ),
        ]
    }
  }
  private useAs(as: string | null): ScopeRecord {
    if (as === null) return this.locals.create("let")
    return this.useLet(as)
  }
  private useLet(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.create("let"))
  }
}

export function compileLet(
  scope: Scope,
  binding: ASTLetBinding,
  value: IRExpr
) {
  return new Let(scope.locals).compile(binding, value)
}

export function coreModule(stmts: ParseStmt[], nativeValue: Value): IRStmt[] {
  const scope = new RootScope()
  const rec = scope.locals.set("native", scope.locals.create("let"))
  return [
    new IRAssignStmt(rec.index, nativeValue),
    ...stmts.flatMap((stmt) => stmt.compile(scope)),
    scope.compileExports(),
  ]
}

export function program(stmts: ParseStmt[]): IRStmt[] {
  const scope = new RootScope()
  return stmts.flatMap((stmt) => stmt.compile(scope))
}
