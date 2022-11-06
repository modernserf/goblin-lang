// Parse tree -- a loose grammar that covers the basic shape of the language

export type ParseArg =
  | { tag: "value"; value: ParseValue }
  | { tag: "var"; value: ParseValue }

export type ParseItem =
  | { tag: "key"; key: string }
  | { tag: "pair"; key: string; value: ParseArg }
  | { tag: "punPair"; key: string }
  | { tag: "method"; params: ParseItem[]; body: ParseStmt[] }

// used for both exprs and bindings
export type ParseValue =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "object"; items: ParseItem[] }
  | { tag: "parens"; value: ParseValue }
  | { tag: "call"; target: ParseValue; args: ParseItem[] }
  | { tag: "unaryOp"; target: ParseValue; operator: string }
  | { tag: "binaryOp"; target: ParseValue; arg: ParseValue; operator: string }

export type ParseStmt =
  | { tag: "let"; binding: ParseValue; value: ParseValue }
  | { tag: "set"; binding: ParseValue; value: ParseValue }
  | { tag: "var"; binding: ParseValue; value: ParseValue }
  | { tag: "return"; value: ParseValue }
  | { tag: "expr"; value: ParseValue }

// AST -- exact grammar; key-value pairs are already ordered & checked for duplicates

export type ASTDestructuredBinding = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTDestructuredBinding[] }
// TODO: `set` paths
export type ASTSetBinding = { tag: "identifier"; value: string }
export type ASTVarBinding = { tag: "identifier"; value: string }

export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr }
  | { tag: "set"; binding: ASTSetBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTVarBinding; value: ASTExpr }
  | { tag: "return"; value: ASTExpr }
  | { tag: "expr"; value: ASTExpr }

export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }

export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTVarArg }

export type ASTFrameArg = {}
export type ASTMethod = {
  selector: string
  params: ASTParam[]
  body: ASTStmt[]
}

export type ASTExpr =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "callKey"; selector: string }
  | { tag: "callArgs"; selector: string; args: ASTArg[] }
  | { tag: "keyFrame"; selector: string }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | { tag: "object"; methods: ASTMethod[] }
