import {
  ParseArg,
  ParseExpr,
  ParseMessage,
  ParseHandler,
  ParsePair,
  ParseStmt,
  ParseParam,
} from "./parser"

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

type HandlerSet = {
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

export class InvalidVarParamError {}
export class InvalidBlockParamError {}
export class InvalidFrameArgError {}
export class InvalidVarArgError {}
export class InvalidBlockArgError {}
export class InvalidLetBindingError {}
export class InvalidSetTargetError {}
export class InvalidVarBindingError {}
export class InvalidProvideBindingError {}
export class InvalidImportBindingError {}
export class InvalidImportSourceError {}
export class InvalidDestructuringError {}
export class DuplicateKeyError {
  constructor(readonly key: string) {}
}
export class DuplicateHandlerError {
  constructor(readonly selector: string) {}
}
export class DuplicateElseHandlerError {}

function astParam(param: ParseParam): ASTParam {
  switch (param.tag) {
    case "value":
      if (param.defaultValue) {
      }
      return { tag: "binding", binding: letBinding(param.value) }
    case "var":
      if (param.value.tag !== "identifier") throw new InvalidVarParamError()
      return { tag: "var", binding: param.value }
    case "do":
      if (param.value.tag !== "identifier") throw new InvalidBlockParamError()
      return { tag: "do", binding: param.value }
    case "on":
      throw "todo: sub-pattern"
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
    if (
      pair.tag === "pair" &&
      pair.value.tag === "value" &&
      pair.value.defaultValue
    ) {
      const copy = out.map((x) => ({
        pairs: x.pairs.slice(),
        bindings: x.bindings.slice(),
      }))
      for (const item of out) {
        item.pairs.push(pair)
      }
      for (const item of copy) {
        item.bindings.push({
          binding: pair.value.value,
          value: pair.value.defaultValue,
        })
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

function expandHandler(handler: ParseHandler): ParseHandler[] {
  if (handler.tag === "else") return [handler]
  if (handler.message.tag === "key") return [handler]
  const out: ParseHandler[] = []
  for (const { pairs, bindings } of expandDefaultParams(
    handler.message.pairs
  )) {
    const body: ParseStmt[] = bindings.map(({ binding, value }) => {
      return { tag: "let", binding, value, export: false }
    })
    body.push(...handler.body)
    out.push({ tag: "on", message: { tag: "pairs", pairs }, body })
  }
  return out
}

function handlerSet(ins: ParseHandler[]): HandlerSet {
  const out: HandlerSet = {
    tag: "object",
    handlers: new Map<string, ASTHandler>(),
    else: null,
  }
  for (const handler of ins.flatMap(expandHandler)) {
    if (handler.tag === "else") {
      if (out.else) throw new DuplicateElseHandlerError()
      out.else = {
        selector: "",
        params: [],
        body: handler.body.map((s) => stmt(s)),
      }
      continue
    }

    const body = handler.body.map((s) => stmt(s))
    const m = build<ParseParam, ASTParam, ASTHandler>(handler.message, {
      key(selector) {
        return { selector, params: [], body }
      },
      punValue(value) {
        return { tag: "binding", binding: { tag: "identifier", value } }
      },
      pair(_, param) {
        return astParam(param)
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

  return out
}

function astArg(arg: ParseArg): ASTArg {
  switch (arg.tag) {
    case "value":
      return { tag: "expr", value: expr(arg.value) }
    case "var":
      switch (arg.value.tag) {
        case "identifier":
          return { tag: "var", value: arg.value }
        default:
          throw new InvalidVarArgError()
      }
    case "handlers":
      return { tag: "do", value: handlerSet(arg.handlers) }
  }
}

function expr(value: ParseExpr): ASTExpr {
  switch (value.tag) {
    case "self":
    case "integer":
    case "float":
    case "string":
    case "identifier":
    case "unit":
      return value
    case "parens":
      return expr(value.value)
    case "unaryOp":
      return {
        tag: "send",
        target: expr(value.target),
        selector: value.operator,
        args: [],
      }
    case "binaryOp":
      return {
        tag: "send",
        target: expr(value.target),
        selector: `${value.operator}:`,
        args: [{ tag: "expr", value: expr(value.arg) }],
      }
    case "do":
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
                [
                  "",
                  {
                    selector: "",
                    params: [],
                    body: value.body.map(stmt),
                  },
                ],
              ]),
            },
          },
        ],
      }
    case "if": {
      const res = value.conds.reduceRight((falseBlock, cond) => {
        const trueBlock = cond.body.map(stmt)
        const send: ASTExpr = {
          tag: "send",
          selector: ":",
          target: expr(cond.value),
          args: [
            {
              tag: "do",
              value: {
                tag: "object",
                else: null,
                handlers: new Map<string, ASTHandler>([
                  [
                    "true",
                    {
                      selector: "true",
                      params: [],
                      body: trueBlock,
                    },
                  ],
                  [
                    "false",
                    {
                      selector: "false",
                      params: [],
                      body: falseBlock,
                    },
                  ],
                ]),
              },
            },
          ],
        }
        return [{ tag: "expr", value: send } as const]
      }, value.else.map(stmt))
      /* istanbul ignore next */
      if (!res.length || res[0].tag !== "expr") throw new Error("unreachable")
      return res[0].value
    }
    case "object":
      return handlerSet(value.handlers)
    case "frame":
      if (value.as) throw new InvalidFrameArgError()
      return build<ParseArg, ASTFrameArg, ASTExpr>(value.message, {
        key(selector) {
          return { tag: "frame", selector, args: [] }
        },
        punValue(key) {
          return { key, value: { tag: "identifier", value: key } }
        },
        pair(key, arg) {
          if (arg.tag !== "value") throw new InvalidFrameArgError()
          return { key, value: expr(arg.value) }
        },
        build(selector, args) {
          return { tag: "frame", selector, args }
        },
      })
    case "send":
      const target = expr(value.target)
      return build<ParseArg, ASTArg, ASTExpr>(value.message, {
        key(selector) {
          return { tag: "send", target, selector, args: [] }
        },
        punValue(value) {
          return { tag: "expr", value: { tag: "identifier", value } }
        },
        pair(_, arg) {
          return astArg(arg)
        },
        build(selector, args) {
          return { tag: "send", target, selector, args }
        },
      })
  }
}

function destructureItem(item: ParsePair<ParseArg>): ASTBindPair {
  switch (item.tag) {
    case "punPair":
      return {
        key: item.key,
        value: { tag: "identifier", value: item.key },
      }
    case "pair":
      switch (item.value.tag) {
        case "handlers":
        case "var":
          throw new InvalidDestructuringError()
        case "value":
          return { key: item.key, value: letBinding(item.value.value) }
      }
  }
}

function destructureMessage(message: ParseMessage<ParseArg>): ASTBindPair[] {
  switch (message.tag) {
    case "key":
      throw new InvalidDestructuringError()
    case "pairs":
      return message.pairs.map(destructureItem)
  }
}

function letBinding(value: ParseExpr): ASTLetBinding {
  switch (value.tag) {
    case "identifier":
      return value
    case "frame":
      let as: string | null = null
      if (value.as) {
        if (value.as.tag !== "identifier") throw new InvalidLetBindingError()
        as = value.as.value
      }
      return { tag: "object", params: destructureMessage(value.message), as }
    default:
      throw new InvalidLetBindingError()
  }
}

function setBinding(value: ParseExpr): ASTSetBinding {
  if (value.tag === "identifier") return value
  throw new InvalidSetTargetError()
}

function setInPlace(value: ParseExpr): ASTStmt {
  let root = value
  while (true) {
    switch (root.tag) {
      case "identifier":
        return { tag: "set", binding: root, value: expr(value) }
      case "send":
        root = root.target
        continue
      default:
        throw new InvalidSetTargetError()
    }
  }
}

function varBinding(value: ParseExpr): ASTVarBinding {
  if (value.tag === "identifier") return value
  throw new InvalidVarBindingError()
}

function importBinding(value: ParseExpr): ASTImportBinding {
  switch (value.tag) {
    case "frame":
      if (value.as) throw new InvalidImportBindingError()
      return {
        tag: "object",
        params: destructureMessage(value.message),
        as: null,
      }
    default:
      throw new InvalidImportBindingError()
  }
}

function importSource(value: ParseExpr): ASTImportSource {
  if (value.tag === "string") return value
  throw new InvalidImportSourceError()
}

function stmt(value: ParseStmt): ASTStmt {
  switch (value.tag) {
    case "let":
      return {
        tag: "let",
        binding: letBinding(value.binding),
        value: expr(value.value),
        export: value.export,
      }
    case "set":
      return {
        tag: "set",
        binding: setBinding(value.binding),
        value: expr(value.value),
      }
    case "setInPlace":
      return setInPlace(value.binding)
    case "var":
      return {
        tag: "var",
        binding: varBinding(value.binding),
        value: expr(value.value),
      }
    case "provide":
      return build<ParseArg, ASTProvidePair, ASTStmt>(value.message, {
        key() {
          throw new InvalidProvideBindingError()
        },
        punValue(key) {
          return {
            key,
            value: { tag: "expr", value: { tag: "identifier", value: key } },
          }
        },
        pair(key, arg) {
          return { key, value: astArg(arg) }
        },
        build(_, args) {
          return { tag: "provide", args }
        },
      })
    case "using":
      return build<ParseParam, ASTUsingPair, ASTStmt>(value.message, {
        key() {
          throw new InvalidProvideBindingError()
        },
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
          return { key, value: astParam(param) }
        },
        build(_, params) {
          return { tag: "using", params }
        },
      })
    case "import":
      return {
        tag: "import",
        binding: importBinding(value.binding),
        source: importSource(value.value),
      }
    case "defer":
      return { tag: "defer", body: value.body.map(stmt) }
    case "return":
      return { tag: "return", value: expr(value.value) }
    case "expr":
      return { tag: "expr", value: expr(value.value) }
  }
}

export function program(items: ParseStmt[]): ASTStmt[] {
  return items.map(stmt)
}

// utils

interface Builder<In, Item, Container> {
  key(key: string): Container
  punValue(key: string): Item
  pair(key: string, value: In): Item
  build(selector: string, values: Item[]): Container
}

function build<In, Item, Container>(
  message: ParseMessage<In>,
  builder: Builder<In, Item, Container>
): Container {
  if (message.tag === "key") {
    return builder.key(message.key)
  }
  const map = new Map<string, Item>()

  for (const param of message.pairs) {
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
