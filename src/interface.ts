// builders

export interface IRSendBuilder {
  compile(inScope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr
}

export type ParamBinding = { binding: ParseBinding; value: ParseExpr }
export interface IHandlerBuilder {
  addPartial(selector: string, handler: PartialHandler): void
  addOn(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void
  addElse(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void
}

// parse
export interface ParseStmt {
  compile(scope: Scope): IRStmt[]
}

export interface ParseExpr {
  compile(scope: Scope, selfBinding?: ParseBinding): IRExpr
  setInPlace?(scope: Scope, expr: ParseExpr): IRStmt[]
  importSource?(scope: Scope): IRExpr
  getHandler?(scope: Scope, selector: string): IRHandler
  asSetBinding?(): ParseBinding
}

export interface ParseBinding {
  var(scope: Scope, value: IRExpr): IRStmt[]
  set(scope: Scope, value: IRExpr): IRStmt[]
  let(scope: Scope, value: IRExpr): IRStmt[]
  import(scope: Scope, source: IRExpr): IRStmt[]
  export(scope: Scope): void
  param(scope: Scope, offset: number): IRStmt[]
  selfBinding(scope: Scope): IRStmt[]
}

export interface PartialHandler {
  params: ParseParam[]
  cond(ifFalse: ParseStmt[]): ParseStmt[]
}

export interface ParseHandler {
  addToClass(builder: IHandlerBuilder): void
  addToBlockClass(builder: IHandlerBuilder): void
}

export interface PatternBuilder<Item, Collection> {
  key(key: string): Collection
  punPair(key: string): this
  pair(key: string, value: Item): this
  build(): Collection
}

export interface ParseArgs {
  provide(scope: Scope): IRStmt[]
  send(): IRSendBuilder
  frame(scope: Scope): IRExpr
}

export interface ParseArg {
  sendArg(scope: Scope): IRArg
  frameArg(): ParseExpr
  provide(scope: Scope, key: string): IRStmt
}

export interface ParseParams {
  using(scope: Scope): IRStmt[]
  addOn(builder: IHandlerBuilder, body: ParseStmt[]): void
  addElse(builder: IHandlerBuilder, body: ParseStmt[]): void
  let(scope: Scope, value: IRExpr): IRStmt[]
  export(scope: Scope): void
  import(scope: Scope, source: IRExpr): IRStmt[]
}

export interface ParseParam {
  toIR(): IRParam
  cond?(arg: ParseExpr, ifTrue: ParseStmt[], ifFalse: ParseStmt[]): ParseStmt[]
  handler(scope: Scope, offset: number): IRStmt[]
  defaultPair?(): { binding: ParseBinding; value: ParseExpr }
  using(scope: Scope, key: string): IRStmt[]
  let(scope: Scope, key: string, value: IRExpr): IRStmt[]
  export(scope: Scope): void
  import(scope: Scope, key: string, source: IRExpr): IRStmt[]
}

export interface PartialParseParam {
  cond(arg: ParseExpr, ifTrue: ParseStmt[], ifFalse: ParseStmt[]): ParseStmt[]
}

// compile
export interface Instance {
  lookup(key: string): IRExpr
  self(): IRExpr
  getPlaceholderHandler(selector: string): IRHandler
  handlerScope(arity: number): Scope
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
  sendScope(): SendScope
}

export interface SendScope extends Scope {
  blockBodyScope(): SendScope
  blockParamsScope(): Scope
}

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

export type IRParam = { tag: "value" } | { tag: "var" } | { tag: "do" }

export interface IRStmt {
  eval(ctx: Interpreter): void | Value
  toHandler?(): IRHandler
}
export interface IRHandler {
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value
  optimize?(): IRHandler
}
export interface IRExpr {
  eval(ctx: Interpreter): Value
  const?(): Value | null
}

export interface IRArg {
  value(ctx: Interpreter): Value
  evalInner(ctx: Interpreter): IRArg
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void
  unload(sender: Interpreter, target: Interpreter, offset: number): void
}

export interface Value extends IRExpr {
  readonly primitiveValue: any
  getIvar(index: number): Value
  send(
    sender: Interpreter,
    selector: string,
    args: IRArg[],
    orElse: IRExpr | null
  ): Value
  instanceof(cls: unknown): boolean
  context(sender: Interpreter): Interpreter
}
