// parse
export interface ParseStmt {
  compile(scope: Scope): IRStmt[]
  unwrap?(): ParseExpr
}

export interface ParseExpr {
  compile(scope: Scope, selfBinding?: string | undefined): IRExpr
  setInPlace?(): ASTSimpleBinding
  simpleBinding?(): ASTSimpleBinding
  letBinding?(): ASTLetBinding
  importBinding?(): ASTImportBinding
  importSource?(): ASTImportSource
}

export interface ParseHandler {
  expand(): ParseHandler[]
  addToSet(handlerSet: HandlerSet): void
}

export type SendResult = { selector: string; args: ASTArg[] }
export type FrameResult = { selector: string; args: ASTFrameArg[] }
export interface ParseArgs {
  provide(scope: Scope): IRStmt[]
  send(): SendResult
  frame(): FrameResult
  destructure(): ASTBindPair[]
}

export interface ParseParams {
  expand(body: ParseStmt[]): ParseHandler[]
  addToSet(out: HandlerSet, body: ParseStmt[]): void
  using(scope: Scope): IRStmt[]
}

export interface ParseParam {
  toAST(): ASTParam
  defaultPair?(): { binding: ParseExpr; value: ParseExpr }
}

export interface ParseArg {
  toAst(): ASTArg
  frameArg?(): ParseExpr
  destructureArg?(): ASTLetBinding
  provide?(scope: Scope, key: string): IRStmt
}

// compile
export interface Instance {
  lookup(key: string): IRExpr
  self(): IRExpr
  getPlaceholderHandler(selector: string): IRHandler
}
export type ScopeType = "let" | "var" | "do"
export type ScopeRecord = { index: number; type: ScopeType }

export interface Locals {
  get(key: string): ScopeRecord | undefined
  set(key: string, value: ScopeRecord): ScopeRecord
  create(type: ScopeType): ScopeRecord
  allocate(count: number): number
}

export interface Scope {
  readonly instance: Instance
  readonly locals: Locals
  lookup(key: string): IRExpr
  lookupOuterLet(key: string): IRExpr
  lookupVarIndex(key: string): number
  addExport(key: string): void
}

// TODO
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

export type ASTFrameArg = { key: string; value: ParseExpr }
export type ASTArg =
  | { tag: "expr"; value: ParseExpr }
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
  body: ParseStmt[]
}

export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }
  | { tag: "do"; binding: ASTBlockParam }
export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTBlockParam = { tag: "identifier"; value: string }

// interpret

export interface Interpreter {
  readonly self: Value
  setLocal(index: number, value: Value): void
  getLocal(index: number): Value
  getIvar(index: number): Value
  use(key: string): Value
  provide(key: string, value: Value): void
  createChild(self: Value): Interpreter
  getModule(key: string): Value
  defer(value: IRStmt[]): void
  resolveDefers(): void
}

export interface Value {
  readonly primitiveValue: any
  getIvar(index: number): Value
  send(sender: Interpreter, selector: string, args: IRArg[]): Value
  trySend(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr
  ): Value
  instanceof(cls: unknown): boolean
  eval(ctx: Interpreter): Value
}
export type IRParam = { tag: "value" } | { tag: "var" } | { tag: "do" }

export interface IRStmt {
  eval(ctx: Interpreter): void | Value
}
export interface IRHandler {
  send(sender: Interpreter, target: Value, args: IRArg[]): Value
}
export interface IRBlockHandler {
  send(sender: Interpreter, ctx: Interpreter, args: IRArg[]): Value
}
export interface IRExpr {
  eval(ctx: Interpreter): Value
}

export interface IRArg {
  value(ctx: Interpreter): Value
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void
  unload(sender: Interpreter, target: Interpreter, offset: number): void
}
