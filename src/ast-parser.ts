export type ParsePair<T> =
  | { tag: "pair"; key: string; value: T }
  | { tag: "punPair"; key: string }

export class InvalidBlockArgError {}
export class InvalidLetBindingError {}
export class InvalidSetTargetError {}
export class InvalidVarBindingError {}
export class InvalidImportBindingError {}
export class InvalidImportSourceError {}
export class InvalidDestructuringError {}
export class InvalidFrameArgError {}
export class InvalidProvideBindingError {}
export class InvalidVarParamError {}
export class InvalidDoParamError {}
export class InvalidVarArgError {}
export class DuplicateHandlerError {
  constructor(readonly selector: string) {}
}
export class DuplicateElseHandlerError {}
export class DuplicateKeyError {
  constructor(readonly key: string) {}
}

export interface ParseStmt {
  stmt(): ASTStmt
}

export class ExprStmt implements ParseStmt {
  constructor(private expr: ParseExpr) {}
  stmt(): ASTStmt {
    return { tag: "expr", value: this.expr.toAST() }
  }
}

export class DeferStmt implements ParseStmt {
  constructor(private body: ParseStmt[]) {}
  stmt(): ASTStmt {
    return { tag: "defer", body: this.body.map((stmt) => stmt.stmt()) }
  }
}

export class ReturnStmt implements ParseStmt {
  constructor(private expr: ParseExpr) {}
  stmt(): ASTStmt {
    return { tag: "return", value: this.expr.toAST() }
  }
}

export class ImportStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private source: ParseExpr) {}
  stmt(): ASTStmt {
    if (!this.binding.importBinding) throw new InvalidImportBindingError()
    if (!this.source.importSource) throw new InvalidImportSourceError()
    return {
      tag: "import",
      binding: this.binding.importBinding(),
      source: this.source.importSource(),
    }
  }
}

export class UsingStmt implements ParseStmt {
  constructor(private params: ParseParams) {}
  stmt(): ASTStmt {
    return this.params.using()
  }
}

export class ProvideStmt implements ParseStmt {
  constructor(private args: ParseArgs) {}
  stmt(): ASTStmt {
    return this.args.provide()
  }
}

export class VarStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private expr: ParseExpr) {}
  stmt(): ASTStmt {
    if (!this.binding.simpleBinding) throw new InvalidVarBindingError()
    return {
      tag: "var",
      binding: this.binding.simpleBinding(),
      value: this.expr.toAST(),
    }
  }
}

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

export class LetStmt implements ParseStmt {
  constructor(
    private binding: ParseExpr,
    private expr: ParseExpr,
    private hasExport: boolean
  ) {}
  stmt(): ASTStmt {
    return {
      tag: "let",
      binding: letBinding(this.binding),
      value: this.expr.toAST(),
      export: this.hasExport,
    }
  }
}

export class SetStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private expr: ParseExpr) {}
  stmt(): ASTStmt {
    if (!this.binding.simpleBinding) throw new InvalidSetTargetError()
    return {
      tag: "set",
      binding: this.binding.simpleBinding(),
      value: this.expr.toAST(),
    }
  }
}

export class SetInPlaceStmt implements ParseStmt {
  constructor(private place: ParseExpr) {}
  stmt(): ASTStmt {
    if (!this.place.setInPlace) throw new InvalidSetTargetError()
    return this.place.setInPlace(this.place.toAST())
  }
}

type ASTSimpleBinding = { tag: "identifier"; value: string }

export interface ParseExpr {
  toAST(): ASTExpr
  setInPlace?(value: ASTExpr): ASTStmt
  simpleBinding?(): ASTSimpleBinding
  letBinding?(): ASTLetBinding
  importBinding?(): ASTImportBinding
  importSource?(): ASTImportSource
}

export const Self: ParseExpr = {
  toAST(): ASTExpr {
    return { tag: "self" }
  },
}

export const Unit: ParseExpr = {
  toAST(): ASTExpr {
    return { tag: "unit" }
  },
}

export class ParseInt implements ParseExpr {
  constructor(private value: number) {}
  toAST(): ASTExpr {
    return { tag: "integer", value: this.value }
  }
}

export class ParseFloat implements ParseExpr {
  constructor(private value: number) {}
  toAST(): ASTExpr {
    return { tag: "float", value: this.value }
  }
}

export class ParseString implements ParseExpr {
  constructor(private value: string) {}
  toAST(): ASTExpr {
    return { tag: "string", value: this.value }
  }
  importSource(): ASTImportSource {
    return { tag: "string", value: this.value }
  }
}

export class ParseIdent implements ParseExpr {
  constructor(private value: string) {}
  toAST(): ASTExpr {
    return { tag: "identifier", value: this.value }
  }
  simpleBinding(): ASTSimpleBinding {
    return { tag: "identifier", value: this.value }
  }
  letBinding(): ASTLetBinding {
    return { tag: "identifier", value: this.value }
  }
  setInPlace(value: ASTExpr): ASTStmt {
    return { tag: "set", binding: this.simpleBinding(), value }
  }
}

export class ParseParens implements ParseExpr {
  constructor(private expr: ParseExpr) {}
  toAST(): ASTExpr {
    return this.expr.toAST()
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  toAST(): ASTExpr {
    return handlerSet(this.handlers)
  }
}

export class ParseFrame implements ParseExpr {
  constructor(private args: ParseArgs, private as: ParseExpr | null) {}
  toAST(): ASTExpr {
    if (this.as) throw new InvalidFrameArgError()
    return this.args.frame()
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
  importBinding(): ASTImportBinding {
    if (this.as) throw new InvalidImportBindingError()
    return {
      tag: "object",
      params: this.args.destructure(),
      as: null,
    }
  }
}

export class ParseSend implements ParseExpr {
  constructor(private target: ParseExpr, private args: ParseArgs) {}
  toAST(): ASTExpr {
    return this.args.send(this.target.toAST())
  }
  setInPlace(value: ASTExpr): ASTStmt {
    if (!this.target.setInPlace) throw new InvalidSetTargetError()
    return this.target.setInPlace(value)
  }
}

export class ParseUnaryOp implements ParseExpr {
  constructor(private target: ParseExpr, private operator: string) {}
  toAST(): ASTExpr {
    return {
      tag: "send",
      target: this.target.toAST(),
      selector: this.operator,
      args: [],
    }
  }
}

export class ParseBinaryOp implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private operator: string,
    private operand: ParseExpr
  ) {}
  toAST(): ASTExpr {
    return {
      tag: "send",
      target: this.target.toAST(),
      selector: `${this.operator}:`,
      args: [{ tag: "expr", value: this.operand.toAST() }],
    }
  }
}

function mapBody(body: ParseStmt[]): ASTStmt[] {
  return body.map((stmt) => stmt.stmt())
}

export class ParseDoBlock implements ParseExpr {
  constructor(private body: ParseStmt[]) {}
  toAST(): ASTExpr {
    return {
      tag: "send",
      target: { tag: "frame", selector: "", args: [] },
      selector: ":",
      args: [
        {
          tag: "do",
          value: {
            tag: "object",
            else: null,
            handlers: new Map<string, ASTHandler>([
              ["", { selector: "", params: [], body: mapBody(this.body) }],
            ]),
          },
        },
      ],
    }
  }
}

type ParseCond = { value: ParseExpr; body: ParseStmt[] }

export class ParseIf implements ParseExpr {
  constructor(private conds: ParseCond[], private elseBody: ParseStmt[]) {}
  toAST(): ASTExpr {
    const res: ASTStmt[] = this.conds.reduceRight((falseBlock, cond) => {
      const trueBlock: ASTStmt[] = mapBody(cond.body)
      const handlers = new Map<string, ASTHandler>([
        ["true", { selector: "true", params: [], body: trueBlock }],
        ["false", { selector: "false", params: [], body: falseBlock }],
      ])
      const send: ASTExpr = {
        tag: "send",
        selector: ":",
        target: cond.value.toAST(),
        args: [{ tag: "do", value: { tag: "object", else: null, handlers } }],
      }
      return [{ tag: "expr", value: send } as ASTStmt]
    }, mapBody(this.elseBody) as ASTStmt[])
    /* istanbul ignore next */
    if (!res.length || res[0].tag !== "expr") throw new Error("unreachable")
    return res[0].value
  }
}

export interface ParseHandler {
  expand(): ParseHandler[]
  addToSet(handlerSet: HandlerSet): void
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

export interface ParseArgs {
  provide(): ASTStmt
  send(target: ASTExpr): ASTExpr
  frame(): ASTExpr
  destructure(): ASTBindPair[]
}

export class KeyArgs implements ParseArgs {
  constructor(private key: string) {}
  provide(): ASTStmt {
    throw new InvalidProvideBindingError()
  }
  send(target: ASTExpr): ASTExpr {
    return { tag: "send", target, selector: this.key, args: [] }
  }
  frame(): ASTExpr {
    return { tag: "frame", selector: this.key, args: [] }
  }
  destructure(): ASTBindPair[] {
    throw new InvalidDestructuringError()
  }
}

export class PairArgs implements ParseArgs {
  constructor(private pairs: ParsePair<ParseArg>[]) {}
  provide(): ASTStmt {
    return build<ParseArg, ASTProvidePair, ASTStmt>(this.pairs, {
      punValue(key) {
        return {
          key,
          value: { tag: "expr", value: { tag: "identifier", value: key } },
        }
      },
      pair(key, arg) {
        return { key, value: arg.toAst() }
      },
      build(_, args) {
        return { tag: "provide", args }
      },
    })
  }
  send(target: ASTExpr): ASTExpr {
    return build<ParseArg, ASTArg, ASTExpr>(this.pairs, {
      punValue(value) {
        return { tag: "expr", value: { tag: "identifier", value } }
      },
      pair(_, arg) {
        return arg.toAst()
      },
      build(selector, args) {
        return { tag: "send", target, selector, args }
      },
    })
  }
  frame(): ASTExpr {
    return build<ParseArg, ASTFrameArg, ASTExpr>(this.pairs, {
      punValue(key) {
        return { key, value: { tag: "identifier", value: key } }
      },
      pair(key, arg) {
        if (!arg.frameArg) throw new InvalidFrameArgError()
        return { key, value: arg.frameArg() }
      },
      build(selector, args) {
        return { tag: "frame", selector, args }
      },
    })
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

export interface ParseParams {
  expand(body: ParseStmt[]): ParseHandler[]
  addToSet(out: HandlerSet, body: ASTStmt[]): void
  using(): ASTStmt
}

export class KeyParams implements ParseParams {
  constructor(private key: string) {}
  expand(body: ParseStmt[]): ParseHandler[] {
    return [new OnHandler(this, body)]
  }
  addToSet(out: HandlerSet, body: ASTStmt[]): void {
    if (out.handlers.has(this.key)) {
      throw new DuplicateHandlerError(this.key)
    }
    out.handlers.set(this.key, { selector: this.key, params: [], body })
  }
  using(): ASTStmt {
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
  addToSet(out: HandlerSet, body: ASTStmt[]): void {
    const m = build<ParseParam, ASTParam, ASTHandler>(this.pairs, {
      punValue(value) {
        return { tag: "binding", binding: { tag: "identifier", value } }
      },
      pair(_, param) {
        return param.toAST()
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
  using(): ASTStmt {
    return build<ParseParam, ASTUsingPair, ASTStmt>(this.pairs, {
      punValue(key) {
        return {
          key,
          value: {
            tag: "binding",
            binding: { tag: "identifier", value: key },
          },
        }
      },
      pair(key, param) {
        return { key, value: param.toAST() }
      },
      build(_, params) {
        return { tag: "using", params }
      },
    })
  }
}

export class OnHandler implements ParseHandler {
  constructor(private message: ParseParams, private body: ParseStmt[]) {}
  expand(): ParseHandler[] {
    return this.message.expand(this.body)
  }
  addToSet(out: HandlerSet): void {
    this.message.addToSet(out, mapBody(this.body))
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
      body: mapBody(this.body),
    }
  }
}

// TODO: eliminate toAST step, compile directly
export interface ParseParam {
  toAST(): ASTParam
  defaultPair?(): { binding: ParseExpr; value: ParseExpr }
}

export class DefaultValueParam implements ParseParam {
  constructor(private binding: ParseExpr, private defaultValue: ParseExpr) {}
  toAST(): ASTParam {
    return { tag: "binding", binding: letBinding(this.binding) }
  }
  defaultPair(): { binding: ParseExpr; value: ParseExpr } {
    return { binding: this.binding, value: this.defaultValue }
  }
}

export class ValueParam implements ParseParam {
  constructor(private value: ParseExpr) {}
  toAST(): ASTParam {
    return { tag: "binding", binding: letBinding(this.value) }
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(): ASTParam {
    if (!this.value.simpleBinding) throw new InvalidVarParamError()
    return { tag: "var", binding: this.value.simpleBinding() }
  }
}

export class DoParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(): ASTParam {
    if (!this.value.simpleBinding) throw new InvalidDoParamError()
    return { tag: "do", binding: this.value.simpleBinding() }
  }
}

export class PatternParam implements ParseParam {
  readonly defaultValue = null
  constructor(private message: ParseParams) {}
  toAST(): ASTParam {
    throw "todo: pattern param"
  }
}

export interface ParseArg {
  toAst(): ASTArg
  frameArg?(): ASTExpr
  destructureArg?(): ASTLetBinding
}

export class ValueArg implements ParseArg {
  constructor(private expr: ParseExpr) {}
  toAst(): ASTArg {
    return { tag: "expr", value: this.expr.toAST() }
  }
  frameArg(): ASTExpr {
    return this.expr.toAST()
  }
  destructureArg(): ASTLetBinding {
    return letBinding(this.expr)
  }
}

export class VarArg implements ParseArg {
  constructor(private binding: ParseExpr) {}
  toAst(): ASTArg {
    if (!this.binding.simpleBinding) throw new InvalidVarArgError()
    return { tag: "var", value: this.binding.simpleBinding() }
  }
}

export class HandlersArg implements ParseArg {
  constructor(private handlers: ParseHandler[]) {}
  toAst(): ASTArg {
    return { tag: "do", value: handlerSet(this.handlers) }
  }
}

export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr; export: boolean }
  | { tag: "set"; binding: ASTSetBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTVarBinding; value: ASTExpr }
  | { tag: "provide"; args: ASTProvidePair[] }
  | { tag: "using"; params: ASTUsingPair[] }
  | { tag: "import"; binding: ASTImportBinding; source: ASTImportSource }
  | { tag: "return"; value: ASTExpr }
  | { tag: "defer"; body: ASTStmt[] }
  | { tag: "expr"; value: ASTExpr }

export type ASTProvidePair = { key: string; value: ASTArg }
export type ASTUsingPair = { key: string; value: ASTParam }
export type ASTBindPair = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTBindPair[]; as: string | null }
export type ASTSetBinding = { tag: "identifier"; value: string } // TODO: `set` paths
export type ASTVarBinding = { tag: "identifier"; value: string }
export type ASTProvideBinding = { tag: "identifier"; value: string }
export type ASTImportBinding = {
  tag: "object"
  params: ASTBindPair[]
  as: null
}
export type ASTImportSource = { tag: "string"; value: string }

export type ASTExpr =
  | { tag: "self" }
  | { tag: "unit" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "send"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | HandlerSet

export type ASTFrameArg = { key: string; value: ASTExpr }
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
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
  body: ASTStmt[]
}

export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }
  | { tag: "do"; binding: ASTBlockParam }
export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTBlockParam = { tag: "identifier"; value: string }

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
