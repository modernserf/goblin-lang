import { ASTLetBinding, ParseStmt } from "./interface"
import { IRSendExpr, IRAssignStmt } from "./interpreter"
import { RootScope } from "./scope"
import { IRExpr, IRStmt, Value, Locals, Scope, ScopeRecord } from "./interface"

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
