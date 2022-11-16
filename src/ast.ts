import { ASTStmt, ParseStmt } from "./ast-parser"

export function program(items: ParseStmt[]): ASTStmt[] {
  return items.map((item) => item.stmt())
}
