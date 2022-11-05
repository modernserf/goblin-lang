export type PrimitiveMethod = (value: any, args: Value[]) => Value

export type PrimitiveClass = Map<string, PrimitiveMethod>

export type Effect = { tag: "var"; argIndex: number; indexInMethod: number }

export type IRMethod = { body: IRStmt[]; effects: Effect[] }
export type IRClass = Map<string, IRMethod>

export type IRArg =
  | { tag: "value"; value: IRExpr }
  | { tag: "var"; index: number }

export type IRExpr =
  | { tag: "local"; index: number }
  | { tag: "ivar"; index: number }
  | { tag: "self" }
  | { tag: "primitive"; class: PrimitiveClass; value: any }
  | { tag: "object"; class: IRClass; ivars: IRExpr[] }
  | { tag: "call"; selector: string; target: IRExpr; args: IRArg[] }

export type IRStmt =
  | { tag: "assign"; index: number; value: IRExpr }
  | { tag: "return"; value: IRExpr }
  | { tag: "expr"; value: IRExpr }

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "primitive"; class: PrimitiveClass; value: any }
