export type Effect = { tag: "var"; argIndex: number; indexInMethod: number }

export type IRMethod =
  | { tag: "object"; body: IRStmt[]; effects: Effect[] }
  | { tag: "primitive"; fn: (value: any, args: Value[]) => Value }
export type IRClass = { methods: Map<string, IRMethod> }

export type IRArg =
  | { tag: "value"; value: IRExpr }
  | { tag: "var"; index: number }

export type IRExpr =
  | { tag: "local"; index: number }
  | { tag: "ivar"; index: number }
  | { tag: "self" }
  | { tag: "primitive"; class: IRClass; value: any }
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
  | { tag: "primitive"; class: IRClass; value: any }
