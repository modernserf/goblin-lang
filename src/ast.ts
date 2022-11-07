import { ParseArg, ParseExpr, ParseItem, ParseStmt } from "./parser"

export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }

export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTVarArg }

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
  | { tag: "call"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | { tag: "object"; methods: Map<string, ASTMethod> }
  | { tag: "use"; value: string }

function methodParam(param: ParseArg): ASTParam {
  switch (param.tag) {
    case "value":
      return { tag: "binding", binding: letBinding(param.value) }
    case "var":
      if (param.value.tag !== "identifier") throw new Error("invalid var param")
      return { tag: "var", binding: param.value }
  }
}

class MapBuilder<T> {
  private map = new Map<string, T>()
  add(key: string, value: T, arg: ParseArg | null) {
    key = arg?.tag === "var" ? `${key}[var]` : key
    if (this.map.has(key)) throw new Error("duplicate key")
    this.map.set(key, value)
  }
  build(): { selector: string; values: T[] } {
    const sortedKeys = Array.from(this.map.keys()).sort()
    // TODO: selector needs to contain `(var)` annotation
    const selector = sortedKeys.map((k) => `${k}:`).join("")
    const values = sortedKeys.map((k) => this.map.get(k)!)
    return { selector, values }
  }
}

function method(item: ParseItem): ASTMethod {
  if (item.tag !== "method") throw new Error("invalid method")
  const body = item.body.map(stmt)

  if (item.params.length === 0) {
    return { selector: "", params: [], body }
  }
  if (item.params[0].tag === "key") {
    if (item.params.length > 1) throw new Error("invalid call structure")
    return { selector: item.params[0].key, params: [], body }
  }

  const map = new MapBuilder<ASTParam>()
  for (const param of item.params) {
    switch (param.tag) {
      case "key":
      case "method":
        throw new Error("invalid method params")
      case "punPair": {
        map.add(
          param.key,
          {
            tag: "binding",
            binding: { tag: "identifier", value: param.key },
          },
          null
        )
        break
      }
      case "pair": {
        map.add(param.key, methodParam(param.value), param.value)
        break
      }
    }
  }
  const { selector, values: params } = map.build()
  return { selector, params, body }
}

function frameArg(key: string, arg: ParseArg): ASTFrameArg {
  if (arg.tag !== "value") throw new Error("Invalid frame entry")
  return { key, value: expr(arg.value) }
}

function frame(items: ParseItem[]): ASTExpr {
  const map = new MapBuilder<ASTFrameArg>()
  for (const item of items) {
    switch (item.tag) {
      case "key":
      case "method":
        throw new Error("invalid frame structure")
      case "punPair": {
        map.add(
          item.key,
          {
            key: item.key,
            value: { tag: "identifier", value: item.key },
          },
          null
        )
        break
      }
      case "pair": {
        map.add(item.key, frameArg(item.key, item.value), item.value)
        break
      }
    }
  }
  const { selector, values: args } = map.build()
  return { tag: "frame", selector, args }
}

function object(items: ParseItem[]): ASTExpr {
  if (items.length === 0) {
    return { tag: "frame", selector: "", args: [] }
  }
  switch (items[0].tag) {
    case "key":
      if (items.length > 1) throw new Error("invalid frame structure")
      return { tag: "frame", selector: items[0].key, args: [] }
    case "method": {
      const methodList = items.map(method)
      const methods = new Map(methodList.map((m) => [m.selector, m]))
      if (methods.size !== methodList.length) {
        throw new Error("duplicate method selector")
      }
      return { tag: "object", methods }
    }
    case "pair":
    case "punPair":
      return frame(items)
  }
}

function callArg(arg: ParseArg): ASTArg {
  switch (arg.tag) {
    case "value":
      return { tag: "expr", value: expr(arg.value) }
    case "var":
      switch (arg.value.tag) {
        case "identifier":
          return { tag: "var", value: arg.value }
        default:
          throw new Error("invalid var arg")
      }
  }
}

function call(target: ASTExpr, items: ParseItem[]): ASTExpr {
  if (items.length === 0) {
    return { tag: "call", target, selector: "", args: [] }
  }
  if (items[0].tag === "key") {
    if (items.length > 1) throw new Error("invalid call structure")
    return { tag: "call", target, selector: items[0].key, args: [] }
  }

  const map = new MapBuilder<ASTArg>()
  for (const item of items) {
    switch (item.tag) {
      case "key":
      case "method":
        throw new Error("invalid call structure")
      case "punPair": {
        map.add(
          item.key,
          {
            tag: "expr",
            value: { tag: "identifier", value: item.key },
          },
          null
        )
        break
      }
      case "pair": {
        map.add(item.key, callArg(item.value), item.value)
        break
      }
    }
  }
  const { selector, values: args } = map.build()
  return { tag: "call", target, selector, args }
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
        tag: "call",
        target: expr(value.target),
        selector: value.operator,
        args: [],
      }
    case "binaryOp":
      return {
        tag: "call",
        target: expr(value.target),
        selector: `${value.operator}:`,
        args: [{ tag: "expr", value: expr(value.arg) }],
      }
    case "object":
      return object(value.items)
    case "call":
      return call(expr(value.target), value.items)
  }
}

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

function destructureItem(item: ParseItem): ASTDestructuredBinding {
  switch (item.tag) {
    case "key":
    case "method":
      throw new Error("invalid destructuring")
    case "punPair":
      return {
        key: item.key,
        value: { tag: "identifier", value: item.key },
      }
    case "pair":
      switch (item.value.tag) {
        case "var":
          throw new Error("invalid destructuring")
        case "value":
          return { key: item.key, value: letBinding(item.value.value) }
      }
  }
}

function letBinding(value: ParseExpr): ASTLetBinding {
  switch (value.tag) {
    case "identifier":
      return value
    case "object":
      return { tag: "object", params: value.items.map(destructureItem) }
    default:
      throw new Error("invalid let binding")
  }
}

function setBinding(value: ParseExpr): ASTSetBinding {
  if (value.tag === "identifier") return value
  throw new Error("invalid set target")
}

function varBinding(value: ParseExpr): ASTVarBinding {
  if (value.tag === "identifier") return value
  throw new Error("invalid var binding")
}

function provideBinding(value: ParseExpr): ASTProvideBinding {
  if (value.tag === "identifier") return value
  throw new Error("invalid provide binding")
}

function importBinding(value: ParseExpr): ASTImportBinding {
  switch (value.tag) {
    case "object":
      return { tag: "object", params: value.items.map(destructureItem) }
    default:
      throw new Error("invalid import binding")
  }
}

function importSource(value: ParseExpr): ASTImportSource {
  if (value.tag === "string") return value
  throw new Error("invalid import source")
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
