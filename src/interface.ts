import { IRBlockClass, IRClass } from "./interpreter"

// parse
export interface ParseStmt {
  compile(scope: Scope): IRStmt[]
  unwrap?(): ParseExpr
}

export interface ParseExpr {
  compile(scope: Scope, selfBinding?: ParseBinding | undefined): IRExpr
  setInPlace?(scope: Scope, expr: ParseExpr): IRStmt[]
  importSource?(scope: Scope): IRExpr
}

export interface ParseBinding {
  var(scope: Scope, expr: ParseExpr): IRStmt[]
  set(scope: Scope, expr: ParseExpr): IRStmt[]
  letBinding(): ASTLetBinding
  export(scope: Scope): void
  let(scope: Scope, value: IRExpr): IRStmt[]
  selfBinding(scope: Scope): IRStmt[]
  import(scope: Scope, source: IRExpr): IRStmt[]
}

export interface ParseHandler {
  expand(): ParseHandler[]
  addToClass(
    instance: Instance,
    cls: IRClass,
    selfBinding: ParseBinding | undefined
  ): void
  addToBlockClass(scope: Scope, cls: IRBlockClass): void
}

export interface PatternBuilder<Item, Collection> {
  key(key: string): Collection
  punPair(key: string): this
  pair(key: string, value: Item): this
  build(): Collection
}

export interface ParseArgs {
  provide(scope: Scope): IRStmt[]
  send(scope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr
  frame(scope: Scope): IRExpr
}

export interface ParseArg {
  sendArg(scope: Scope): IRArg
  frameArg(): ParseExpr
  provide(scope: Scope, key: string): IRStmt
}

export interface ParseParams {
  expand(body: ParseStmt[]): ParseHandler[]
  using(scope: Scope): IRStmt[]
  addToClass(
    instance: Instance,
    cls: IRClass,
    body: ParseStmt[],
    selfBinding: ParseBinding | undefined
  ): void
  addToBlockClass(scope: Scope, cls: IRBlockClass, body: ParseStmt[]): void
  destructure(): ASTBindPair[]
  export(scope: Scope): void
}

export interface ParseParam {
  toIR(): IRParam
  handler(scope: Scope, offset: number): IRStmt[]
  defaultPair?(): { binding: ParseBinding; value: ParseExpr }
  using(scope: Scope, key: string): IRStmt[]
  destructureArg(): ASTLetBinding
  export(scope: Scope): void
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
export type ASTBindPair = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTBindPair[]; as: string | null }

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
