import {
  ParseArg,
  ParseExpr,
  ParseMessage,
  ParseMethod,
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

export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTBlockArg =
  | { tag: "identifier"; value: string }
  | { tag: "object"; methods: Map<string, ASTMethod> }
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
  | { tag: "call"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | { tag: "object"; methods: Map<string, ASTMethod> }
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

function methodParam(param: ParseArg): ASTParam {
  switch (param.tag) {
    case "value":
      return { tag: "binding", binding: letBinding(param.value) }
    case "var":
      if (param.value.tag !== "identifier") throw new InvalidVarParamError()
      return { tag: "var", binding: param.value }
    case "case":
      throw new InvalidParamError()
    case "block":
      if (param.value.tag !== "identifier") throw new InvalidBlockParamError()
      return { tag: "block", binding: param.value }
  }
}

function frameArg(key: string, arg: ParseArg): ASTFrameArg {
  if (arg.tag !== "value") throw new InvalidFrameArgError()
  return { key, value: expr(arg.value) }
}

function messageArg(arg: ParseArg): ASTArg {
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
          throw "invalid block arg"
      }
    case "case": {
      const methods = methodSet(arg.methods)
      return { tag: "block", value: { tag: "object", methods } }
    }
  }
}

function argKey(key: string, arg: ParseArg | null) {
  if (!arg) return `${key}:`
  switch (arg.tag) {
    case "var":
      return `${key}[var]:`
    case "block":
    case "case":
      return `${key}[block]:`
    default:
      return `${key}:`
  }
}

class MapBuilder<T> {
  private map = new Map<string, T>()
  add(key: string, value: T, arg: ParseArg | null) {
    const taggedKey = argKey(key, arg)
    if (this.map.has(taggedKey)) throw new DuplicateKeyError(key)
    this.map.set(taggedKey, value)
  }
  build(): { selector: string; values: T[] } {
    const sortedKeys = Array.from(this.map.keys()).sort()
    const selector = sortedKeys.join("")
    const values = sortedKeys.map((k) => this.map.get(k)!)
    return { selector, values }
  }
}

// These three are all basically identical, need to refactor
function method(message: ParseMessage, inBody: ParseStmt[]): ASTMethod {
  const body = inBody.map(stmt)
  if (message.tag === "key") {
    return { selector: message.key, params: [], body }
  }

  const map = new MapBuilder<ASTParam>()
  for (const param of message.pairs) {
    switch (param.tag) {
      case "punPair":
        const binding: ASTLetBinding = { tag: "identifier", value: param.key }
        map.add(param.key, { tag: "binding", binding }, null)
        break
      case "pair":
        map.add(param.key, methodParam(param.value), param.value)
        break
    }
  }
  const { selector, values } = map.build()
  return { selector, params: values, body }
}

function frame(message: ParseMessage): ASTExpr {
  if (message.tag === "key") {
    return { tag: "frame", selector: message.key, args: [] }
  }
  const map = new MapBuilder<ASTFrameArg>()
  for (const item of message.pairs) {
    switch (item.tag) {
      case "punPair":
        const value: ASTExpr = { tag: "identifier", value: item.key }
        map.add(item.key, { key: item.key, value }, null)
        break
      case "pair":
        map.add(item.key, frameArg(item.key, item.value), item.value)
        break
    }
  }
  const { selector, values: args } = map.build()
  return { tag: "frame", selector, args }
}

function send(target: ASTExpr, message: ParseMessage): ASTExpr {
  if (message.tag === "key") {
    return { tag: "call", target, selector: message.key, args: [] }
  }
  const map = new MapBuilder<ASTArg>()
  for (const item of message.pairs) {
    switch (item.tag) {
      case "punPair":
        const value: ASTExpr = { tag: "identifier", value: item.key }
        map.add(item.key, { tag: "expr", value }, null)
        break
      case "pair":
        map.add(item.key, messageArg(item.value), item.value)
        break
    }
  }
  const { selector, values: args } = map.build()
  return { tag: "call", target, selector, args }
}

// given {foo: block a bar: block b} generate
// foo:bar: foo[block]:bar: foo:bar[block]: foo[block]:bar[block]:
function expandParams(message: ParseMessage): ParseMessage[] {
  if (message.tag === "key") {
    return [message]
  }
  let out: ParsePair[][] = [[]]
  for (const p of message.pairs) {
    if (p.tag === "pair" && p.value.tag === "block") {
      const unblock: ParsePair = {
        tag: "pair",
        key: p.key,
        value: { tag: "value", value: p.value.value },
      }
      const left = out.map((ps) => [...ps, p])
      const right = out.map((ps) => [...ps, unblock])
      out = left.concat(right)
    } else {
      for (const ps of out) {
        ps.push(p)
      }
    }
  }
  return out.map((pairs) => ({ tag: "pairs", pairs }))
}

function methodSet(ins: ParseMethod[]): Map<string, ASTMethod> {
  const out = new Map<string, ASTMethod>()
  for (const { message, body } of ins) {
    for (const params of expandParams(message)) {
      const m = method(params, body)
      if (out.has(m.selector)) {
        throw new DuplicateMethodError(m.selector)
      }
      out.set(m.selector, m)
    }
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
    case "object": {
      const methods = methodSet(value.methods)
      return { tag: "object", methods }
    }
    case "frame":
      return frame(value.message)
    case "send":
      return send(expr(value.target), value.message)
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
        case "case":
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
