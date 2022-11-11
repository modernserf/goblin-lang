export type IRParam = { tag: "value" } | { tag: "var" } | { tag: "block" }

export type IRHandler =
  | { tag: "object"; body: IRStmt[]; params: IRParam[] }
  | {
      tag: "primitive"
      fn: (value: any, args: Value[]) => Value
    }
export type IRClass = {
  handlers: Map<string, IRHandler>
  else: IRStmt[] | null
}

export type IRBlockHandler = {
  body: IRStmt[]
  offset: number
  params: IRParam[]
}
export type IRBlockClass = {
  handlers: Map<string, IRBlockHandler>
  else: IRStmt[] | null
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
  | { tag: "send"; selector: string; target: IRExpr; args: IRArg[] }
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

export class NoHandlerError {
  constructor(readonly selector: string) {}
}

export class NoProviderError {
  constructor(readonly key: string) {}
}
