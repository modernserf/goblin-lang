export type ParseStmt =
  | { tag: "let"; binding: ParseExpr; value: ParseExpr; export: boolean }
  | { tag: "set"; binding: ParseExpr; value: ParseExpr }
  | { tag: "setInPlace"; binding: ParseExpr }
  | { tag: "var"; binding: ParseExpr; value: ParseExpr }
  | { tag: "import"; binding: ParseExpr; value: ParseExpr }
  | { tag: "provide"; message: ParseMessage<ParseArg> }
  | { tag: "using"; message: ParseMessage<ParseParam> }
  | { tag: "return"; value: ParseExpr }
  | { tag: "defer"; body: ParseStmt[] }
  | { tag: "expr"; value: ParseExpr }

// used for both ast exprs and bindings
export type ParseExpr =
  | { tag: "self" }
  | { tag: "unit" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "parens"; value: ParseExpr }
  | { tag: "object"; handlers: ParseHandler[] }
  | { tag: "frame"; message: ParseMessage<ParseArg>; as: ParseExpr | null }
  | { tag: "send"; target: ParseExpr; message: ParseMessage<ParseArg> }
  | { tag: "do"; body: ParseStmt[] }
  | { tag: "if"; conds: ParseCond[]; else: ParseStmt[] }
  | { tag: "unaryOp"; target: ParseExpr; operator: string }
  | { tag: "binaryOp"; target: ParseExpr; arg: ParseExpr; operator: string }

type ParseCond = { value: ParseExpr; body: ParseStmt[] }

export type ParseMessage<T> =
  | { tag: "key"; key: string }
  | { tag: "pairs"; pairs: ParsePair<T>[] }
export type ParsePair<T> =
  | { tag: "pair"; key: string; value: T }
  | { tag: "punPair"; key: string }
export type ParseArg =
  | { tag: "value"; value: ParseExpr }
  | { tag: "var"; value: ParseExpr }
  | { tag: "handlers"; handlers: ParseHandler[] }

// TODO: multiple messages, decorators
export type ParseHandler =
  | { tag: "on"; message: ParseMessage<ParseParam>; body: ParseStmt[] }
  | { tag: "else"; body: ParseStmt[] }

export class InvalidVarParamError {}
export class InvalidDoParamError {}

// TODO: eliminate toAST step, compile directly
export interface ParseParam {
  toAST(ast: any): ASTParam
  defaultPair?(): { binding: ParseExpr; value: ParseExpr }
}

export class DefaultValueParam implements ParseParam {
  constructor(private binding: ParseExpr, private defaultValue: ParseExpr) {}
  toAST(ast: any): ASTParam {
    return { tag: "binding", binding: ast.letBinding(this.binding) }
  }
  defaultPair(): { binding: ParseExpr; value: ParseExpr } {
    return { binding: this.binding, value: this.defaultValue }
  }
}

export class ValueParam implements ParseParam {
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    // TODO: is anything done with defaultValue here?
    return { tag: "binding", binding: ast.letBinding(this.value) }
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    if (this.value.tag !== "identifier") throw new InvalidVarParamError()
    return { tag: "var", binding: this.value }
  }
}

export class DoParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    if (this.value.tag !== "identifier") throw new InvalidDoParamError()
    return { tag: "do", binding: this.value }
  }
}

export class PatternParam implements ParseParam {
  readonly defaultValue = null
  constructor(private message: ParseMessage<ParseParam>) {}
  toAST(ast: any): ASTParam {
    throw "todo: pattern param"
  }
}

export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr; export: boolean }
  | { tag: "set"; binding: ASTSetBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTVarBinding; value: ASTExpr }
  | { tag: "provide"; args: ASTProvidePair[] }
  | { tag: "using"; params: ASTUsingPair[] }
  | { tag: "import"; binding: ASTImportBinding; source: ASTImportSource }
  | { tag: "return"; value: ASTExpr }
  | { tag: "defer"; body: ASTStmt[] }
  | { tag: "expr"; value: ASTExpr }

export type ASTProvidePair = { key: string; value: ASTArg }
export type ASTUsingPair = { key: string; value: ASTParam }
export type ASTBindPair = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTBindPair[]; as: string | null }
export type ASTSetBinding = { tag: "identifier"; value: string } // TODO: `set` paths
export type ASTVarBinding = { tag: "identifier"; value: string }
export type ASTProvideBinding = { tag: "identifier"; value: string }
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
