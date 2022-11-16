export interface ParseStmt {
  stmt(): ASTStmt
}

export interface ParseExpr {
  toAST(): ASTExpr
  setInPlace?(value: ASTExpr): ASTStmt
  simpleBinding?(): ASTSimpleBinding
  letBinding?(): ASTLetBinding
  importBinding?(): ASTImportBinding
  importSource?(): ASTImportSource
}

export interface ParseHandler {
  expand(): ParseHandler[]
  addToSet(handlerSet: HandlerSet): void
}

export interface ParseArgs {
  provide(): ASTStmt
  send(target: ASTExpr): ASTExpr
  frame(): ASTExpr
  destructure(): ASTBindPair[]
}

export interface ParseParams {
  expand(body: ParseStmt[]): ParseHandler[]
  addToSet(out: HandlerSet, body: ASTStmt[]): void
  using(): ASTStmt
}

export interface ParseParam {
  toAST(): ASTParam
  defaultPair?(): { binding: ParseExpr; value: ParseExpr }
}

export interface ParseArg {
  toAst(): ASTArg
  frameArg?(): ASTExpr
  destructureArg?(): ASTLetBinding
}

// TODO
export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr; export: boolean }
  | { tag: "set"; binding: ASTSimpleBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTSimpleBinding; value: ASTExpr }
  | { tag: "provide"; args: ASTProvidePair[] }
  | { tag: "using"; params: ASTUsingPair[] }
  | { tag: "import"; binding: ASTImportBinding; source: ASTImportSource }
  | { tag: "return"; value: ASTExpr }
  | { tag: "defer"; body: ASTStmt[] }
  | { tag: "expr"; value: ASTExpr }

export type ASTProvidePair = { key: string; value: ASTArg }
export type ASTUsingPair = { key: string; value: ASTParam }
export type ASTBindPair = { key: string; value: ASTLetBinding }
export type ASTSimpleBinding = { tag: "identifier"; value: string }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTBindPair[]; as: string | null }
export type ASTImportBinding = {
  tag: "object"
  params: ASTBindPair[]
  as: null
}
export type ASTImportSource = { tag: "string"; value: string }

export type ASTExpr =
  | { tag: "self" }
  | { tag: "unit" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "send"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | HandlerSet

export type ASTFrameArg = { key: string; value: ASTExpr }
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTVarArg }
  | { tag: "do"; value: ASTBlockArg }
export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTBlockArg = HandlerSet

export type HandlerSet = {
  tag: "object"
  handlers: Map<string, ASTHandler>
  else: ASTHandler | null
}

export type ASTHandler = {
  selector: string
  params: ASTParam[]
  body: ASTStmt[]
}

export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }
  | { tag: "do"; binding: ASTBlockParam }
export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTBlockParam = { tag: "identifier"; value: string }
