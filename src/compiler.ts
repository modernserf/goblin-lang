import { IRStmt, IRExpr, ParseStmt } from "./interface"
import { IRAssignStmt } from "./ir-stmt"
import { rootScope } from "./scope"

export function coreModule(stmts: ParseStmt[], nativeValue: IRExpr): IRStmt[] {
  const scope = rootScope()
  const rec = scope.locals.set("native", scope.locals.create("let"))
  return [
    new IRAssignStmt(rec.index, nativeValue),
    ...stmts.flatMap((stmt) => stmt.compile(scope)),
    scope.compileExports(),
  ]
}

export function module(stmts: ParseStmt[]): IRStmt[] {
  const scope = rootScope()
  return [
    ...stmts.flatMap((stmt) => stmt.compile(scope)),
    scope.compileExports(),
  ]
}

export function program(stmts: ParseStmt[]): IRStmt[] {
  const scope = rootScope()
  return stmts.flatMap((stmt) => stmt.compile(scope))
}
