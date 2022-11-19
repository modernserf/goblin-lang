import { IRStmt, IRExpr, ParseStmt } from "./interface"
import { IRAssignStmt } from "./ir"
import { RootScope } from "./scope"

export function coreModule(stmts: ParseStmt[], nativeValue: IRExpr): IRStmt[] {
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
