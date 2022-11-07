export type PrimitiveMethod = (value: any, args: Value[]) => Value

// TODO: primitive class should be able to contain IR Methods (which access no ivars, only other methods)
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
  | { tag: "use"; key: string }

export type IRStmt =
  | { tag: "assign"; index: number; value: IRExpr }
  | { tag: "return"; value: IRExpr }
  | { tag: "expr"; value: IRExpr }
  | { tag: "provide"; key: string; value: IRExpr }

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "primitive"; class: PrimitiveClass; value: any }
