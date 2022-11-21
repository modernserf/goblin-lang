import {
  ElseHandler,
  OnHandler,
  ParseIdent,
  ParseIf,
  ParsePlaceholder,
  ParseSend,
} from "./expr"
import {
  InvalidDestructuringError,
  InvalidProvideBindingError,
  InvalidElseParamsError,
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
  IRBlockClassBuilder,
  PartialHandler,
  PartialParseParam,
} from "./interface"
import { IRLocalExpr, IRSendExpr, IRUseExpr } from "./ir-expr"
import {
  elseHandler,
  elseBlockHandler,
  onHandler,
  IROnBlockHandler,
} from "./ir-handler"
import { build } from "./message-builder"
import { ExprStmt, LetStmt } from "./stmt"
import { ArgsBuilder, HandlersArg, ValueArg } from "./args"

class InvalidParamsError {}

type Pair = { key: string; value: ParseParam }

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
    selfBinding: ParseBinding
  ): void {
    const scope = instance.handlerScope(0)
    const head = selfBinding.selfBinding(scope)
    cls.addFinal(this.key, scope, body, (body) => onHandler([], head, body))
  }
  addToBlockClass(
    scope: Scope,
    cls: IRBlockClassBuilder,
    body: ParseStmt[]
  ): void {
    cls.addFinal(
      this.key,
      scope,
      body,
      (body) => new IROnBlockHandler(0, [], body)
    )
  }
  addElseToClass(): void {
    throw new InvalidElseParamsError(this.key)
  }
  addElseToBlockClass(): void {
    throw new InvalidElseParamsError(this.key)
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
      params,
      cond: (ifFalse) => {
        const ifTrue = coll ? coll.cond(ifFalse) : body
        return p.cond(new ParseLocal(index), ifTrue, ifFalse)
      },
    }
  }, null)
}

type ParamBinding = { binding: ParseBinding; value: ParseExpr }
class PairParams implements ParseParams {
  constructor(private pairs: Pair[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    body: ParseStmt[],
    selfBinding: ParseBinding
  ): void {
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          const scope = instance.handlerScope(params.length)

          const partial = condParams(params, body)
          if (partial) {
            cls.addPartial(selector, partial)
          } else {
            const head = this.handlerHead(scope, selfBinding, params, bindings)
            cls.addFinal(selector, scope, body, (body) =>
              onHandler(params, head, body)
            )
          }
        },
      })
    }
  }
  addElseToClass(
    instance: Instance,
    cls: IRClassBuilder,
    body: ParseStmt[],
    selfBinding: ParseBinding
  ): void {
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          const scope = instance.handlerScope(params.length)
          const head = this.handlerHead(scope, selfBinding, params, bindings)
          cls.addElse(selector, scope, body, (body) =>
            elseHandler(
              selector,
              params.map((p) => p.toIR()),
              head.concat(body)
            )
          )
        },
      })
    }
  }
  addToBlockClass(
    inScope: Scope,
    cls: IRBlockClassBuilder,
    body: ParseStmt[]
  ): void {
    // block params use parent scope, and do not start at zero
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      const scope = inScope.blockBodyScope()
      const paramScope = scope.blockParamsScope()
      const offset = scope.locals.allocate(pairs.length)
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          const partial = condParams(params, body)
          if (partial) {
            cls.addPartial(selector, partial)
          } else {
            const head = this.handlerHead(
              scope,
              ParsePlaceholder,
              params,
              bindings,
              offset,
              paramScope
            )
            cls.addFinal(
              selector,
              scope,
              body,
              (body) =>
                new IROnBlockHandler(
                  offset,
                  params.map((p) => p.toIR()),
                  head.concat(body)
                )
            )
          }
        },
      })
    }
  }
  addElseToBlockClass(
    scope: Scope,
    cls: IRBlockClassBuilder,
    body: ParseStmt[]
  ): void {
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      const offset = scope.locals.allocate(pairs.length)
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          const paramScope = scope.blockParamsScope()
          const head = this.handlerHead(
            scope,
            ParsePlaceholder,
            params,
            bindings,
            offset,
            paramScope
          )
          cls.addElse(selector, scope, body, (body) =>
            elseBlockHandler(
              selector,
              offset,
              params.map((p) => p.toIR()),
              head.concat(body)
            )
          )
        },
      })
    }
  }
  private handlerHead(
    scope: Scope,
    selfBinding: ParseBinding,
    params: ParseParam[],
    bindings: ParamBinding[],
    offset: number = 0,
    paramScope: Scope = scope
  ): IRStmt[] {
    return [
      ...selfBinding.selfBinding(scope),
      ...params.flatMap((p, i) => p.handler(paramScope, offset + i)),
      ...bindings.flatMap(({ binding, value }) =>
        new LetStmt(binding, value, false).compile(scope)
      ),
    ]
  }
  private expandDefaultParams() {
    type ParamWithBindings = {
      pairs: Pair[]
      bindings: { binding: ParseBinding; value: ParseExpr }[]
    }
    const out: ParamWithBindings[] = [{ pairs: [], bindings: [] }]
    for (const pair of this.pairs) {
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

export class PartialPatternParam implements ParseParam, PartialParseParam {
  constructor(private params: ParseParams) {}
  cond(arg: ParseExpr, ifTrue: ParseStmt[], ifFalse: ParseStmt[]): ParseStmt[] {
    const send = new ParseSend(
      arg,
      new ArgsBuilder()
        .pair(
          "",
          new HandlersArg([
            new OnHandler(this.params, ifTrue),
            new ElseHandler(new PairParams([]), ifFalse),
          ])
        )
        .build()
    )
    return [new ExprStmt(send)]
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

export class PartialValueParam implements ParseParam, PartialParseParam {
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
