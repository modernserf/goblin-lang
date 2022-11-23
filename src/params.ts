import { ElseHandler, OnHandler, ParseIf, ParseSend } from "./expr"
import {
  InvalidDestructuringError,
  InvalidProvideBindingError,
  InvalidElseParamsError,
} from "./error"
import {
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
  PartialParseParam,
  IHandlerBuilder,
  PartialHandler,
} from "./interface"
import { IRLocalExpr, IRSendExpr, IRUseExpr } from "./ir-expr"
import { build } from "./message-builder"
import { ExprStmt } from "./stmt"
import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import { ParseBindIdent } from "./binding"

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
    this.pairs.push({ key, value: new ValueParam(new ParseBindIdent(key)) })
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
  addOn(builder: IHandlerBuilder, body: ParseStmt[]): void {
    builder.addOn(this.key, [], [], body)
  }
  addElse(builder: IHandlerBuilder): void {
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

class PairParams implements ParseParams {
  constructor(private pairs: Pair[]) {}
  addOn(builder: IHandlerBuilder, body: ParseStmt[]): void {
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          const partial = this.condParams(params, body)
          if (partial) {
            builder.addPartial(selector, partial)
          } else {
            builder.addOn(selector, params, bindings, body)
          }
        },
      })
    }
  }
  addElse(builder: IHandlerBuilder, body: ParseStmt[]): void {
    for (const { pairs, bindings } of this.expandDefaultParams()) {
      build<ParseParam, ParseParam, void>(pairs, {
        pair: (_, param) => param,
        build: (selector, params) => {
          builder.addElse(selector, params, bindings, body)
        },
      })
    }
  }
  private condParams(
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
    return this.binding.param(scope, offset)
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
    return this.binding.param(scope, offset)
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
