import { ParseIdent, ParseIf, ParseSend } from "./expr"
import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  InvalidDestructuringError,
  InvalidProvideBindingError,
} from "./error"
import {
  Instance,
  IRExpr,
  IRParam,
  IRStmt,
  ParseBinding,
  ParseExpr,
  ParseParam,
  ParseParams,
  ParseStmt,
  PatternBuilder,
  Scope,
  IRClassBuilder,
  PartialHandler,
  PartialParseParam,
} from "./interface"
import {
  IRElseBlockHandler,
  IRLocalExpr,
  IROnBlockHandler,
  IRSendExpr,
  IRUseExpr,
} from "./ir"
import { build } from "./message-builder"
import { ExprStmt, LetStmt } from "./stmt"
import { BasicScope, LocalsImpl } from "./scope"
import { IRBlockClass } from "./value"
import { ArgsBuilder, ValueArg } from "./args"

class InvalidParamsError {}

type Pair = { key: string; value: ParseParam }

class IRBlockClassBuilder extends IRBlockClass {
  add(
    selector: string,
    offset: number,
    params: IRParam[],
    body: IRStmt[]
  ): this {
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    this.handlers.set(selector, new IROnBlockHandler(offset, params, body))
    return this
  }
  addElse(body: IRStmt[]): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError()
    this.elseHandler = new IRElseBlockHandler(body)
    return this
  }
}

export class ParamsBuilder implements PatternBuilder<ParseParam, ParseParams> {
  private pairs: Pair[] = []
  key(key: string): ParseParams {
    // TODO: maybe `return new InvalidParams(key, this.pairs)`
    if (this.pairs.length) throw new InvalidParamsError()
    return new KeyParams(key)
  }
  punPair(key: string): this {
    this.pairs.push({ key, value: new ValueParam(new ParseIdent(key)) })
    return this
  }
  pair(key: string, value: ParseParam): this {
    this.pairs.push({ key, value })
    return this
  }
  build(): ParseParams {
    return new PairParams(this.pairs)
  }
}

class KeyParams implements ParseParams {
  constructor(private key: string) {}
  using(): IRStmt[] {
    throw new InvalidProvideBindingError()
  }
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    body: ParseStmt[],
    selfBinding: ParseBinding | undefined
  ): void {
    const scope = new BasicScope(instance, new LocalsImpl())
    cls.addFinal(
      this.key,
      scope,
      [],
      compileSelfBinding(scope, selfBinding),
      body
    )
  }
  addToBlockClass(
    scope: Scope,
    cls: IRBlockClassBuilder,
    body: ParseStmt[]
  ): void {
    cls.add(
      this.key,
      0,
      [],
      body.flatMap((stmt) => stmt.compile(scope))
    )
  }
  /* istanbul ignore next */
  export(scope: Scope): void {
    throw new Error("unreachable")
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    throw new InvalidDestructuringError()
  }
  let(scope: Scope, value: IRExpr): IRStmt[] {
    throw new InvalidDestructuringError()
  }
}

type ParamWithBindings = {
  pairs: Pair[]
  bindings: { binding: ParseBinding; value: ParseExpr }[]
}
function expandDefaultParams(pairs: Pair[]): ParamWithBindings[] {
  const out: ParamWithBindings[] = [{ pairs: [], bindings: [] }]
  for (const pair of pairs) {
    if (pair.value.defaultPair) {
      const copy = out.map((x) => ({
        pairs: x.pairs.slice(),
        bindings: x.bindings.slice(),
      }))
      for (const item of out) {
        item.pairs.push(pair)
      }
      for (const item of copy) {
        item.bindings.push(pair.value.defaultPair())
      }
      out.push(...copy)
    } else {
      for (const item of out) {
        item.pairs.push(pair)
      }
    }
  }
  return out
}

class ParseLocal implements ParseExpr {
  constructor(private index: number) {}
  compile(): IRExpr {
    return new IRLocalExpr(this.index)
  }
}

function condParams(
  params: ParseParam[],
  body: ParseStmt[]
): PartialHandler | null {
  return params.reduceRight((coll: PartialHandler | null, param, index) => {
    if (!param.cond) return coll
    const p = param as PartialParseParam
    return {
      cond: (ifFalse) => {
        const ifTrue = coll ? coll.cond(ifFalse) : body
        return p.cond(new ParseLocal(index), ifTrue, ifFalse)
      },
    }
  }, null)
}

class PairParams implements ParseParams {
  constructor(private pairs: Pair[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    body: ParseStmt[],
    selfBinding: ParseBinding | undefined
  ): void {
    for (const { pairs, bindings } of expandDefaultParams(this.pairs)) {
      build<ParseParam, ParseParam, void>(pairs, {
        pair(_, param) {
          return param
        },
        build(selector, params) {
          const scope = new BasicScope(instance, new LocalsImpl(params.length))

          const partial = condParams(params, body)
          if (partial) {
            cls.addPartial(selector, partial)
          } else {
            cls.addFinal(
              selector,
              scope,
              params.map((p) => p.toIR()),
              [
                ...compileSelfBinding(scope, selfBinding),
                ...params.flatMap((p, i) => p.handler(scope, i)),
                ...bindings.flatMap(({ binding, value }) =>
                  new LetStmt(binding, value, false).compile(scope)
                ),
              ],
              body
            )
          }
        },
      })
    }
  }
  addToBlockClass(
    scope: Scope,
    cls: IRBlockClassBuilder,
    body: ParseStmt[]
  ): void {
    // block params use parent scope, and do not start at zero
    for (const { pairs, bindings } of expandDefaultParams(this.pairs)) {
      const offset = scope.locals.allocate(pairs.length)
      build<ParseParam, ParseParam, void>(pairs, {
        pair(_, param) {
          return param
        },
        build(selector, params) {
          const paramScope = new BasicScope(scope.instance, scope.locals)
          cls.add(
            selector,
            offset,
            params.map((p) => p.toIR()),
            [
              ...params.flatMap((p, i) => p.handler(paramScope, offset + i)),
              ...bindings.flatMap(({ binding, value }) =>
                new LetStmt(binding, value, false).compile(scope)
              ),
              ...body.flatMap((stmt) => stmt.compile(scope)),
            ]
          )
        },
      })
    }
  }
  using(scope: Scope): IRStmt[] {
    return build<ParseParam, { key: string; value: ParseParam }, IRStmt[]>(
      this.pairs,
      {
        pair(key, param) {
          return { key, value: param }
        },
        build(_, params) {
          return params.flatMap((param) => param.value.using(scope, param.key))
        },
      }
    )
  }
  export(scope: Scope): void {
    this.pairs.forEach((pair) => {
      pair.value.export(scope)
    })
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    return this.pairs.flatMap((pair) =>
      pair.value.import(scope, pair.key, source)
    )
  }
  let(scope: Scope, value: IRExpr): IRStmt[] {
    return this.pairs.flatMap((pair) => pair.value.let(scope, pair.key, value))
  }
}

export class DefaultValueParam implements ParseParam {
  constructor(private binding: ParseBinding, private defaultValue: ParseExpr) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    return this.binding.handler(scope, offset)
  }
  defaultPair(): { binding: ParseBinding; value: ParseExpr } {
    return { binding: this.binding, value: this.defaultValue }
  }
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using default values"
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
  import(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
  /* istanbul ignore next */
  export(scope: Scope): void {
    throw "todo: default params in let bindings"
  }
  /* istanbul ignore next */
  let(scope: Scope, key: string, value: IRExpr): IRStmt[] {
    throw "todo: default params in let bindings"
  }
}

export class PartialValueParam implements ParseParam {
  constructor(private value: ParseExpr) {}
  cond(arg: ParseExpr, ifTrue: ParseStmt[], ifFalse: ParseStmt[]): ParseStmt[] {
    const cond = new ParseSend(
      this.value,
      new ArgsBuilder().pair("=", new ValueArg(arg)).build()
    )
    return [new ExprStmt(new ParseIf(cond, ifTrue, ifFalse))]
  }
  handler(scope: Scope, offset: number): IRStmt[] {
    return []
  }
  using(scope: Scope, key: string): IRStmt[] {
    throw "todo: partial using"
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
  /* istanbul ignore next */
  export(): void {
    throw new Error("unreachable")
  }
  import(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
  let(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
}

export class ValueParam implements ParseParam {
  constructor(private binding: ParseBinding) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    return this.binding.handler(scope, offset)
  }
  using(scope: Scope, key: string): IRStmt[] {
    return this.binding.let(scope, new IRUseExpr(key))
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
  export(scope: Scope): void {
    this.binding.export(scope)
  }
  import(scope: Scope, key: string, source: IRExpr): IRStmt[] {
    return this.binding.let(scope, new IRSendExpr(key, source, []))
  }
  let(scope: Scope, key: string, value: IRExpr): IRStmt[] {
    return this.binding.let(scope, new IRSendExpr(key, value, []))
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private key: string) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    scope.locals.set(this.key, {
      index: offset,
      type: "var",
    })
    return []
  }
  // TODO: provide{x: var x} should remove x from parent scope
  // using{x: var x} should remove x from subsequent contexts
  // same ownership applies to provide/using do blocks
  //
  // Also, should be ways to remove arbitrary items & completely clear context
  // maybe: `using{x: take x}`, `provide{clear}`
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using var param"
  }
  toIR(): IRParam {
    return { tag: "var" }
  }
  /* istanbul ignore next */
  export(): void {
    throw new Error("unreachable")
  }
  import(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
  let(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
}

export class DoParam implements ParseParam {
  readonly defaultValue = null
  constructor(private key: string) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    if (!this.key) return []
    scope.locals.set(this.key, {
      index: offset,
      type: "do",
    })
    return []
  }
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using do param"
  }
  toIR(): IRParam {
    return { tag: "do" }
  }
  /* istanbul ignore next */
  export(): void {
    throw new Error("unreachable")
  }
  import(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
  let(): IRStmt[] {
    throw new InvalidDestructuringError()
  }
}

function compileSelfBinding(
  scope: Scope,
  binding: ParseBinding | undefined
): IRStmt[] {
  if (binding) return binding.selfBinding(scope)
  return []
}
