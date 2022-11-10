import {
  ParseArg,
  ParseExpr,
  ParseMessage,
  ParseHandler,
  ParsePair,
  ParseStmt,
} from "./parser"

export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTBlockParam = { tag: "identifier"; value: string }
export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }
  | { tag: "block"; binding: ASTBlockParam }

export type ASTBlockCase = { params: ASTParam[]; body: ASTStmt[] }

type HandlerSet = {
  tag: "object"
  methods: Map<string, ASTMethod>
  elseHandler: ASTStmt[] | null
}

export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTBlockArg = { tag: "identifier"; value: string } | HandlerSet
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTVarArg }
  | { tag: "block"; value: ASTBlockArg }

export type ASTFrameArg = {
  key: string
  value: ASTExpr
}
export type ASTMethod = {
  selector: string
  params: ASTParam[]
  body: ASTStmt[]
}

export type ASTExpr =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "send"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | HandlerSet
  | { tag: "use"; value: string }

export type ASTDestructuredBinding = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTDestructuredBinding[] }
// TODO: `set` paths
export type ASTSetBinding = { tag: "identifier"; value: string }
export type ASTVarBinding = { tag: "identifier"; value: string }
export type ASTProvideBinding = { tag: "identifier"; value: string }

export type ASTImportBinding = {
  tag: "object"
  params: ASTDestructuredBinding[]
}
export type ASTImportSource = { tag: "string"; value: string }

export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr }
  | { tag: "set"; binding: ASTSetBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTVarBinding; value: ASTExpr }
  | { tag: "provide"; binding: ASTProvideBinding; value: ASTExpr }
  | { tag: "import"; binding: ASTImportBinding; source: ASTImportSource }
  | { tag: "return"; value: ASTExpr }
  | { tag: "expr"; value: ASTExpr }

export class InvalidParamError {}
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
export class DuplicateMethodError {
  constructor(readonly selector: string) {}
}

export class DuplicateElseHandlerError {}

function handlerSet(ins: ParseHandler[]): HandlerSet {
  const out: HandlerSet = {
    tag: "object",
    methods: new Map<string, ASTMethod>(),
    elseHandler: null,
  }
  for (const handler of ins) {
    if (handler.tag === "else") {
      if (out.elseHandler) throw new DuplicateElseHandlerError()
      out.elseHandler = handler.body.map((s) => stmt(s))
      continue
    }

    const body = handler.body.map((s) => stmt(s))
    const m = build<ASTParam, ASTMethod>(handler.message, {
      key(selector) {
        return { selector, params: [], body }
      },
      punValue(value) {
        return { tag: "binding", binding: { tag: "identifier", value } }
      },
      pair(_, param) {
        switch (param.tag) {
          case "value":
            return { tag: "binding", binding: letBinding(param.value) }
          case "var":
            if (param.value.tag !== "identifier")
              throw new InvalidVarParamError()
            return { tag: "var", binding: param.value }
          case "handlers":
            throw new InvalidParamError()
          case "block":
            if (param.value.tag !== "identifier")
              throw new InvalidBlockParamError()
            return { tag: "block", binding: param.value }
        }
      },
      build(selector, params) {
        return { selector, params, body }
      },
    })
    if (out.methods.has(m.selector)) {
      throw new DuplicateMethodError(m.selector)
    }
    out.methods.set(m.selector, m)
  }

  return out
}

function expr(value: ParseExpr): ASTExpr {
  switch (value.tag) {
    case "self":
    case "integer":
    case "string":
    case "identifier":
    case "use":
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
      // do ... end -> []{:{} ...}

      return {
        tag: "send",
        target: { tag: "frame", selector: "", args: [] },
        selector: ":",
        args: [
          {
            tag: "block",
            value: {
              tag: "object",
              elseHandler: null,
              methods: new Map<string, ASTMethod>([
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
    case "object":
      return handlerSet(value.handlers)
    case "frame":
      return build<ASTFrameArg, ASTExpr>(value.message, {
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
      return build<ASTArg, ASTExpr>(value.message, {
        key(selector) {
          return { tag: "send", target, selector, args: [] }
        },
        punValue(value) {
          return { tag: "expr", value: { tag: "identifier", value } }
        },
        pair(_, arg) {
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
            case "block":
              switch (arg.value.tag) {
                case "identifier":
                  return { tag: "block", value: arg.value }
                default:
                  throw new InvalidBlockArgError()
              }
            case "handlers":
              return { tag: "block", value: handlerSet(arg.handlers) }
          }
        },
        build(selector, args) {
          return { tag: "send", target, selector, args }
        },
      })
  }
}

function destructureItem(item: ParsePair): ASTDestructuredBinding {
  switch (item.tag) {
    case "punPair":
      return {
        key: item.key,
        value: { tag: "identifier", value: item.key },
      }
    case "pair":
      switch (item.value.tag) {
        case "block":
        case "handlers":
        case "var":
          throw new InvalidDestructuringError()
        case "value":
          return { key: item.key, value: letBinding(item.value.value) }
      }
  }
}

function destructureMessage(message: ParseMessage): ASTDestructuredBinding[] {
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
      return { tag: "object", params: destructureMessage(value.message) }
    default:
      throw new InvalidLetBindingError()
  }
}

function setBinding(value: ParseExpr): ASTSetBinding {
  if (value.tag === "identifier") return value
  throw new InvalidSetTargetError()
}

function varBinding(value: ParseExpr): ASTVarBinding {
  if (value.tag === "identifier") return value
  throw new InvalidVarBindingError()
}

function provideBinding(value: ParseExpr): ASTProvideBinding {
  if (value.tag === "identifier") return value
  throw new InvalidProvideBindingError()
}

function importBinding(value: ParseExpr): ASTImportBinding {
  switch (value.tag) {
    case "frame":
      return { tag: "object", params: destructureMessage(value.message) }
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
      }
    case "set":
      return {
        tag: "set",
        binding: setBinding(value.binding),
        value: expr(value.value),
      }
    case "var":
      return {
        tag: "var",
        binding: varBinding(value.binding),
        value: expr(value.value),
      }
    case "provide":
      return {
        tag: "provide",
        binding: provideBinding(value.binding),
        value: expr(value.value),
      }
    case "import":
      return {
        tag: "import",
        binding: importBinding(value.binding),
        source: importSource(value.value),
      }
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

interface Builder<Item, Container> {
  key(key: string): Container
  punValue(key: string): Item
  pair(key: string, value: ParseArg): Item
  build(selector: string, values: Item[]): Container
}

function build<Item, Container>(
  message: ParseMessage,
  builder: Builder<Item, Container>
): Container {
  if (message.tag === "key") {
    return builder.key(message.key)
  }
  const map = new Map<string, Item>()

  for (const param of message.pairs) {
    const value = "value" in param ? param.value : null
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
