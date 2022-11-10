export type IRMethod =
  | { tag: "object"; body: IRStmt[] }
  | { tag: "primitive"; fn: (value: any, args: Value[]) => Value }
export type IRClass = {
  methods: Map<string, IRMethod>
  elseHandler: IRStmt[] | null
}

export type IRBlockMethod = { body: IRStmt[]; offset: number }
export type IRBlockClass = {
  methods: Map<string, IRBlockMethod>
  elseHandler: IRStmt[] | null
}

export type IRArg =
  | { tag: "value"; value: IRExpr }
  | { tag: "var"; index: number }
  | { tag: "block"; class: IRBlockClass }

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

type Ctx = {}

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "block"; class: IRBlockClass; ctx: Ctx }
  | { tag: "primitive"; class: IRClass; value: any }

export class PrimitiveTypeError {
  constructor(readonly expected: string) {}
}

export class NoMethodError {
  constructor(readonly selector: string) {}
}

export class NoProviderError {
  constructor(readonly key: string) {}
}
