import { ASTLetBinding, ParseStmt } from "./interface"
import { IRSendExpr, IRAssignStmt } from "./interpreter"
import { RootScope } from "./scope"
import { IRExpr, IRStmt, Value, Locals, Scope, ScopeRecord } from "./interface"

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
