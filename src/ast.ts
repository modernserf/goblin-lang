import { compileLet, compileObject, compileSend } from "./compiler"
import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  DuplicateKeyError,
  InvalidDestructuringError,
  InvalidDoParamError,
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidSetTargetError,
  InvalidVarArgError,
  InvalidVarParamError,
} from "./error"
import { frame } from "./frame"
import {
  ASTArg,
  ASTBindPair,
  ASTHandler,
  ASTLetBinding,
  ASTParam,
  ASTSimpleBinding,
  HandlerSet,
  IRExpr,
  IRParam,
  IRStmt,
  ParseArg,
  ParseArgs,
  ParseExpr,
  ParseHandler,
  ParseParam,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import {
  IRModuleExpr,
  IRProvideStmt,
  IRUseExpr,
  PrimitiveValue,
  unit,
} from "./interpreter"
import { floatClass, intClass, stringClass } from "./primitive"
import { ExprStmt, LetStmt } from "./stmt"

export type ParsePair<T> =
  | { tag: "pair"; key: string; value: T }
  | { tag: "punPair"; key: string }

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
      { tag: "expr", value: this.operand },
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

export class KeyArgs implements ParseArgs {
  constructor(private key: string) {}
  provide(): IRStmt[] {
    throw new InvalidProvideBindingError()
  }
  send(scope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    return compileSend(scope, this.key, target, [], orElse)
  }
  frame(scope: Scope): IRExpr {
    return frame(this.key, [])
  }
  destructure(): ASTBindPair[] {
    throw new InvalidDestructuringError()
  }
}

export class PairArgs implements ParseArgs {
  constructor(private pairs: ParsePair<ParseArg>[]) {}
  provide(scope: Scope): IRStmt[] {
    return build<ParseArg, { key: string; value: ParseArg }, IRStmt[]>(
      this.pairs,
      {
        punValue(key) {
          return {
            key,
            value: new ValueArg(new ParseIdent(key)),
          }
        },
        pair(key, arg) {
          return { key, value: arg }
        },
        build(_, args) {
          return args.map((arg) => {
            return arg.value.provide(scope, arg.key)
          })
        },
      }
    )
  }
  send(scope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    return build<ParseArg, ParseArg, IRExpr>(this.pairs, {
      punValue(key) {
        return new ValueArg(new ParseIdent(key))
      },
      pair(_, arg) {
        return arg
      },
      build(selector, args) {
        return compileSend(
          scope,
          selector,
          target,
          args.map((arg) => arg.toAst()),
          orElse
        )
      },
    })
  }
  frame(scope: Scope): IRExpr {
    return build<ParseArg, { key: string; value: ParseExpr }, IRExpr>(
      this.pairs,
      {
        punValue(key) {
          return { key, value: new ParseIdent(key) }
        },
        pair(key, arg) {
          if (!arg.frameArg) throw new InvalidFrameArgError()
          return { key, value: arg.frameArg() }
        },
        build(selector, args) {
          return frame(
            selector,
            args.map((arg) => ({
              key: arg.key,
              value: arg.value.compile(scope),
            }))
          )
        },
      }
    )
  }
  destructure(): ASTBindPair[] {
    return this.pairs.map((item) => {
      switch (item.tag) {
        case "punPair":
          return {
            key: item.key,
            value: { tag: "identifier", value: item.key },
          }
        case "pair":
          if (!item.value.destructureArg) throw new InvalidDestructuringError()
          return {
            key: item.key,
            value: item.value.destructureArg(),
          }
      }
    })
  }
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
  toAST(): ASTParam {
    return { tag: "binding", binding: letBinding(this.binding) }
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
  toAST(): ASTParam {
    throw "todo: pattern param"
  }
  using(scope: Scope): IRStmt[] {
    throw "todo: using pattern param"
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
}

export class ValueParam implements ParseParam {
  constructor(private value: ParseExpr) {}
  toAST(): ASTParam {
    return { tag: "binding", binding: letBinding(this.value) }
  }
  using(scope: Scope, key: string): IRStmt[] {
    return compileLet(scope, letBinding(this.value), new IRUseExpr(key))
  }
  toIR(): IRParam {
    return { tag: "value" }
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(): ASTParam {
    if (!this.value.simpleBinding) throw new InvalidVarParamError()
    return { tag: "var", binding: this.value.simpleBinding() }
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
  toAST(): ASTParam {
    if (!this.value.simpleBinding) throw new InvalidDoParamError()
    return { tag: "do", binding: this.value.simpleBinding() }
  }
  using(scope: Scope): IRStmt[] {
    throw "todo: using do param"
  }
  toIR(): IRParam {
    return { tag: "do" }
  }
}

export class ValueArg implements ParseArg {
  constructor(private expr: ParseExpr) {}
  toAst(): ASTArg {
    return { tag: "expr", value: this.expr }
  }
  frameArg(): ParseExpr {
    return this.expr
  }
  destructureArg(): ASTLetBinding {
    return letBinding(this.expr)
  }
  provide(scope: Scope, key: string): IRStmt {
    return new IRProvideStmt(key, this.expr.compile(scope))
  }
}

export class VarArg implements ParseArg {
  constructor(private binding: ParseExpr) {}
  toAst(): ASTArg {
    if (!this.binding.simpleBinding) throw new InvalidVarArgError()
    return { tag: "var", value: this.binding.simpleBinding() }
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide var"
  }
}

export class HandlersArg implements ParseArg {
  constructor(private handlers: ParseHandler[]) {}
  toAst(): ASTArg {
    return { tag: "do", value: handlerSet(this.handlers) }
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide handler"
  }
}

interface Builder<In, Item, Container> {
  punValue(key: string): Item
  pair(key: string, value: In): Item
  build(selector: string, values: Item[]): Container
}

function build<In, Item, Container>(
  pairs: ParsePair<In>[],
  builder: Builder<In, Item, Container>
): Container {
  const map = new Map<string, Item>()

  for (const param of pairs) {
    if (map.has(param.key)) throw new DuplicateKeyError(param.key)
    switch (param.tag) {
      case "punPair":
        map.set(param.key, builder.punValue(param.key))
        continue
      case "pair":
        map.set(param.key, builder.pair(param.key, param.value))
        continue
    }
  }

  const sortedKeys = Array.from(map.keys()).sort()
  const selector = sortedKeys.map((k) => `${k}:`).join("")
  const values = sortedKeys.map((k) => map.get(k)!)
  return builder.build(selector, values)
}
