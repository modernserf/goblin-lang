import { HandlersArg, KeyArgs, PairArgs, ValueArg } from "./args"
import { compileLet, compileObject, compileSend } from "./compiler"
import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  InvalidDoParamError,
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidSetTargetError,
  InvalidVarParamError,
} from "./error"
import {
  ASTHandler,
  ASTLetBinding,
  ASTSimpleBinding,
  HandlerSet,
  IRExpr,
  IRParam,
  IRStmt,
  ParseArgs,
  ParseExpr,
  ParseHandler,
  ParsePair,
  ParseParam,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import {
  IRLocalExpr,
  IRModuleExpr,
  IRUseExpr,
  PrimitiveValue,
  unit,
} from "./interpreter"
import { build } from "./message-builder"
import { floatClass, intClass, stringClass } from "./primitive"
import { ExprStmt, LetStmt } from "./stmt"

function handlerSet(ins: ParseHandler[]): HandlerSet {
  const out: HandlerSet = {
    tag: "object",
    handlers: new Map<string, ASTHandler>(),
    else: null,
  }
  for (const handler of ins.flatMap((x) => x.expand())) {
    handler.addToSet(out)
  }

  return out
}

function letBinding(value: ParseExpr): ASTLetBinding {
  if (!value.letBinding) throw new InvalidLetBindingError()
  return value.letBinding()
}

export const Self: ParseExpr = {
  compile(scope) {
    return scope.instance.self()
  },
}

export const Unit: ParseExpr = {
  compile() {
    return unit
  },
}

export class ParseInt implements ParseExpr {
  constructor(private value: number) {}
  compile(): IRExpr {
    return new PrimitiveValue(intClass, this.value)
  }
}

export class ParseFloat implements ParseExpr {
  constructor(private value: number) {}
  compile(): IRExpr {
    return new PrimitiveValue(floatClass, this.value)
  }
}

export class ParseString implements ParseExpr {
  constructor(private value: string) {}
  compile(): IRExpr {
    return new PrimitiveValue(stringClass, this.value)
  }
  importSource(scope: Scope): IRExpr {
    return new IRModuleExpr(this.value)
  }
}

export class ParseIdent implements ParseExpr {
  constructor(private value: string) {}
  compile(scope: Scope): IRExpr {
    return scope.lookup(this.value)
  }
  simpleBinding(): ASTSimpleBinding {
    return { tag: "identifier", value: this.value }
  }
  letBinding(): ASTLetBinding {
    return { tag: "identifier", value: this.value }
  }
  setInPlace(): ASTSimpleBinding {
    return this.simpleBinding()
  }
}

export class ParseParens implements ParseExpr {
  constructor(private expr: ParseExpr) {}
  compile(scope: Scope, selfBinding?: string | undefined): IRExpr {
    return this.expr.compile(scope)
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding?: string | undefined): IRExpr {
    const hs = handlerSet(this.handlers)
    return compileObject(hs, scope, selfBinding)
  }
}

export class ParseFrame implements ParseExpr {
  constructor(private args: ParseArgs, private as: ParseExpr | null) {}
  compile(scope: Scope): IRExpr {
    if (this.as) throw new InvalidFrameArgError()
    return this.args.frame(scope)
  }
  letBinding(): ASTLetBinding {
    if (this.as) {
      if (!this.as.simpleBinding) throw new InvalidLetBindingError()
      return {
        tag: "object",
        params: this.args.destructure(),
        as: this.as.simpleBinding().value,
      }
    }
    return {
      tag: "object",
      params: this.args.destructure(),
      as: null,
    }
  }
  importBinding(scope: Scope, source: IRExpr): IRStmt[] {
    if (this.as) throw new InvalidImportBindingError()
    return compileLet(
      scope,
      {
        tag: "object",
        params: this.args.destructure(),
        as: null,
      },
      source
    )
  }
}

export class ParseSend implements ParseExpr {
  constructor(private target: ParseExpr, private args: ParseArgs) {}
  compile(scope: Scope): IRExpr {
    return this.args.send(scope, this.target, null)
  }
  setInPlace(): ASTSimpleBinding {
    if (!this.target.setInPlace) throw new InvalidSetTargetError()
    return this.target.setInPlace()
  }
}

export class ParseTrySend implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private args: ParseArgs,
    private orElse: ParseExpr
  ) {}
  compile(scope: Scope): IRExpr {
    return this.args.send(scope, this.target, this.orElse)
  }
}

export class ParseUnaryOp implements ParseExpr {
  constructor(private target: ParseExpr, private operator: string) {}
  compile(scope: Scope): IRExpr {
    return compileSend(scope, this.operator, this.target, [])
  }
}

export class ParseBinaryOp implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private operator: string,
    private operand: ParseExpr
  ) {}
  compile(scope: Scope): IRExpr {
    return compileSend(scope, `${this.operator}:`, this.target, [
      new ValueArg(this.operand),
    ])
  }
}

export class ParseDoBlock implements ParseExpr {
  constructor(private body: ParseStmt[]) {}
  compile(scope: Scope): IRExpr {
    const expr: ParseExpr = new ParseSend(
      new ParseFrame(new KeyArgs(""), null),
      new PairArgs([
        {
          tag: "pair",
          key: "",
          value: new HandlersArg([new OnHandler(new KeyParams(""), this.body)]),
        },
      ])
    )
    return expr.compile(scope)
  }
}

type ParseCond = { value: ParseExpr; body: ParseStmt[] }

export class ParseIf implements ParseExpr {
  constructor(private conds: ParseCond[], private elseBody: ParseStmt[]) {}
  compile(scope: Scope): IRExpr {
    const res: ParseStmt[] = this.conds.reduceRight((falseBlock, cond) => {
      const trueBlock = cond.body
      const send = new ParseSend(
        cond.value,
        new PairArgs([
          {
            tag: "pair",
            key: "",
            value: new HandlersArg([
              new OnHandler(new KeyParams("true"), trueBlock),
              new OnHandler(new KeyParams("false"), falseBlock),
            ]),
          },
        ])
      )

      return [new ExprStmt(send)]
    }, this.elseBody)
    if (res[0] && res[0].unwrap) {
      return res[0].unwrap().compile(scope)
    }
    throw new Error("unreachable")
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

export class OnHandler implements ParseHandler {
  constructor(private message: ParseParams, private body: ParseStmt[]) {}
  expand(): ParseHandler[] {
    return this.message.expand(this.body)
  }
  addToSet(out: HandlerSet): void {
    this.message.addToSet(out, this.body)
  }
}
export class ElseHandler implements ParseHandler {
  constructor(private body: ParseStmt[]) {}
  expand(): ParseHandler[] {
    return [this]
  }
  addToSet(handlerSet: HandlerSet): void {
    if (handlerSet.else) throw new DuplicateElseHandlerError()
    handlerSet.else = {
      selector: "",
      params: [],
      body: this.body,
    }
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
  handler(scope: Scope, offset: number): IRStmt[] {
    throw "todo: handler pattern param"
  }
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
  using(scope: Scope): IRStmt[] {
    throw "todo: using do param"
  }
  toIR(): IRParam {
    return { tag: "do" }
  }
}
