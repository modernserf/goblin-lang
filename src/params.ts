import { OnHandler, ParseIdent } from "./expr"
import {
  InvalidDoParamError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidVarParamError,
} from "./error"
import {
  ASTLetBinding,
  Instance,
  IRParam,
  IRStmt,
  ParseExpr,
  ParseHandler,
  ParsePair,
  ParseParam,
  ParseParams,
  ParseStmt,
  PatternBuilder,
  Scope,
} from "./interface"
import {
  IRBlockClass,
  IRClass,
  IRLocalExpr,
  IRObjectHandler,
  IRUseExpr,
} from "./interpreter"
import { build } from "./message-builder"
import { LetStmt } from "./stmt"
import { BasicScope, LocalsImpl } from "./scope"

class InvalidParamsError {}

export class ParamsBuilder implements PatternBuilder<ParseParam, ParseParams> {
  private pairs: ParsePair<ParseParam>[] = []
  key(key: string): ParseParams {
    // TODO: maybe `return new InvalidParams(key, this.pairs)`
    if (this.pairs.length) throw new InvalidParamsError()
    return new KeyParams(key)
  }
  punPair(key: string): this {
    this.pairs.push({ tag: "punPair", key })
    return this
  }
  pair(key: string, value: ParseParam): this {
    this.pairs.push({ tag: "pair", key, value })
    return this
  }
  build(): ParseParams {
    return new PairParams(this.pairs)
  }
}

class KeyParams implements ParseParams {
  constructor(private key: string) {}
  expand(body: ParseStmt[]): ParseHandler[] {
    return [new OnHandler(this, body)]
  }
  using(): IRStmt[] {
    throw new InvalidProvideBindingError()
  }
  addToClass(
    instance: Instance,
    cls: IRClass,
    body: ParseStmt[],
    selfBinding: ParseExpr | undefined
  ): void {
    const scope = new BasicScope(instance, new LocalsImpl())
    cls.add(
      this.key,
      new IRObjectHandler(
        [],
        [
          ...compileSelfBinding(scope, selfBinding),
          ...body.flatMap((stmt) => stmt.compile(scope)),
        ]
      )
    )
  }
  addToBlockClass(scope: Scope, cls: IRBlockClass, body: ParseStmt[]): void {
    cls.add(
      this.key,
      0,
      [],
      body.flatMap((stmt) => stmt.compile(scope))
    )
  }
}

type ParamWithBindings = {
  pairs: ParsePair<ParseParam>[]
  bindings: { binding: ParseExpr; value: ParseExpr }[]
}
function expandDefaultParams(
  pairs: ParsePair<ParseParam>[]
): ParamWithBindings[] {
  const out: ParamWithBindings[] = [{ pairs: [], bindings: [] }]
  for (const pair of pairs) {
    if (pair.tag === "pair" && pair.value.defaultPair) {
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

class PairParams implements ParseParams {
  constructor(private pairs: ParsePair<ParseParam>[]) {}
  expand(body: ParseStmt[]): ParseHandler[] {
    const out: ParseHandler[] = []
    for (const { pairs, bindings } of expandDefaultParams(this.pairs)) {
      out.push(
        new OnHandler(new PairParams(pairs), [
          ...bindings.map(
            ({ binding, value }) => new LetStmt(binding, value, false)
          ),
          ...body,
        ])
      )
    }
    return out
  }
  addToClass(
    instance: Instance,
    cls: IRClass,
    body: ParseStmt[],
    selfBinding: ParseExpr | undefined
  ): void {
    build<ParseParam, ParseParam, void>(this.pairs, {
      punValue(value) {
        return new ValueParam(new ParseIdent(value))
      },
      pair(_, param) {
        return param
      },
      build(selector, params) {
        const scope = new BasicScope(instance, new LocalsImpl(params.length))
        cls.add(
          selector,
          new IRObjectHandler(
            params.map((p) => p.toIR()),
            [
              ...compileSelfBinding(scope, selfBinding),
              ...params.flatMap((p, i) => p.handler(scope, i)),
              ...body.flatMap((s) => s.compile(scope)),
            ]
          )
        )
      },
    })
  }
  addToBlockClass(scope: Scope, cls: IRBlockClass, body: ParseStmt[]): void {
    // block params use parent scope, and do not start at zero
    const offset = scope.locals.allocate(this.pairs.length)
    build<ParseParam, ParseParam, void>(this.pairs, {
      punValue(value) {
        return new ValueParam(new ParseIdent(value))
      },
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
            ...body.flatMap((stmt) => stmt.compile(scope)),
          ]
        )
      },
    })
  }
  using(scope: Scope): IRStmt[] {
    return build<ParseParam, { key: string; value: ParseParam }, IRStmt[]>(
      this.pairs,
      {
        punValue(key) {
          return { key, value: new ValueParam(new ParseIdent(key)) }
        },
        pair(key, param) {
          return { key, value: param }
        },
        build(_, params) {
          return params.flatMap((param) => param.value.using(scope, param.key))
        },
      }
    )
  }
}

// TODO: should DefaultValueParam & PatternParam be a different type?
// ie ParseParams.expand() => ParseExpandedParams
export class DefaultValueParam implements ParseParam {
  constructor(private binding: ParseExpr, private defaultValue: ParseExpr) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    const binding = letBinding(this.binding)
    switch (binding.tag) {
      case "identifier":
        scope.locals.set(binding.value, { index: offset, type: "let" })
        return []
      case "object": {
        if (!this.binding.let) throw new InvalidLetBindingError()
        return this.binding.let(scope, new IRLocalExpr(offset))
      }
    }
  }
  defaultPair(): { binding: ParseExpr; value: ParseExpr } {
    return { binding: this.binding, value: this.defaultValue }
  }
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using default values"
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
}

export class PatternParam implements ParseParam {
  readonly defaultValue = null
  constructor(private message: ParseParams) {}
  /* istanbul ignore next */
  handler(scope: Scope, offset: number): IRStmt[] {
    throw "todo: handler pattern param"
  }
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using pattern param"
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
}

export class ValueParam implements ParseParam {
  constructor(private binding: ParseExpr) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    const binding = letBinding(this.binding)
    switch (binding.tag) {
      case "identifier":
        scope.locals.set(binding.value, { index: offset, type: "let" })
        return []
      case "object": {
        if (!this.binding.let) throw new InvalidLetBindingError()
        return this.binding.let(scope, new IRLocalExpr(offset))
      }
    }
  }
  using(scope: Scope, key: string): IRStmt[] {
    if (!this.binding.let) throw new InvalidLetBindingError()
    return this.binding.let(scope, new IRUseExpr(key))
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    if (!this.value.simpleBinding) throw new InvalidVarParamError()
    scope.locals.set(this.value.simpleBinding().value, {
      index: offset,
      type: "var",
    })
    return []
  }
  /* istanbul ignore next */
  using(scope: Scope): IRStmt[] {
    throw "todo: using var param"
  }
  toIR(): IRParam {
    return { tag: "var" }
  }
}

export class DoParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  handler(scope: Scope, offset: number): IRStmt[] {
    if (!this.value.simpleBinding) throw new InvalidDoParamError()
    scope.locals.set(this.value.simpleBinding().value, {
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
}

function letBinding(value: ParseExpr): ASTLetBinding {
  if (!value.letBinding) throw new InvalidLetBindingError()
  return value.letBinding()
}

function compileSelfBinding(
  scope: Scope,
  binding: ParseExpr | undefined
): IRStmt[] {
  if (binding && binding.selfBinding) {
    return binding.selfBinding(scope)
  }
  return []
}
