import { OnHandler, ParseIdent } from "./expr"
import { compileLet } from "./compiler"
import {
  DuplicateHandlerError,
  InvalidDoParamError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidVarParamError,
} from "./error"
import {
  ASTHandler,
  ASTLetBinding,
  HandlerSet,
  IRParam,
  IRStmt,
  ParseExpr,
  ParseHandler,
  ParsePair,
  ParseParam,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import { IRBlockClass, IRLocalExpr, IRUseExpr } from "./interpreter"
import { build } from "./message-builder"
import { LetStmt } from "./stmt"
import { BasicScope } from "./scope"

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

export class KeyParams implements ParseParams {
  constructor(private key: string) {}
  expand(body: ParseStmt[]): ParseHandler[] {
    return [new OnHandler(this, body)]
  }
  addToSet(out: HandlerSet, body: ParseStmt[]): void {
    if (out.handlers.has(this.key)) {
      throw new DuplicateHandlerError(this.key)
    }
    out.handlers.set(this.key, { selector: this.key, params: [], body })
  }
  using(): IRStmt[] {
    throw new InvalidProvideBindingError()
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

export class PairParams implements ParseParams {
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
  addToSet(out: HandlerSet, body: ParseStmt[]): void {
    const m = build<ParseParam, ParseParam, ASTHandler>(this.pairs, {
      punValue(value) {
        return new ValueParam(new ParseIdent(value))
      },
      pair(_, param) {
        return param
      },
      build(selector, params) {
        return { selector, params, body }
      },
    })
    if (out.handlers.has(m.selector)) {
      throw new DuplicateHandlerError(m.selector)
    }
    out.handlers.set(m.selector, m)
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
        return compileLet(scope, binding, new IRLocalExpr(offset))
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
        return compileLet(scope, binding, new IRLocalExpr(offset))
      }
    }
  }
  using(scope: Scope, key: string): IRStmt[] {
    return compileLet(scope, letBinding(this.binding), new IRUseExpr(key))
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
