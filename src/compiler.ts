import { IRStmt, ParseStmt } from "./interface"
import { rootScope } from "./scope"

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
