// Parse tree -- a loose grammar that covers the basic shape of the language

import { Lexer, Token } from "./lexer"

export type ParseArg =
  | { tag: "value"; value: ParseExpr }
  | { tag: "var"; value: ParseExpr }
// TODO: curly brace => block

function arg(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return { tag: "var", value: must(lexer, "expr", expr) }
    default:
      return { tag: "value", value: must(lexer, "expr", expr) }
  }
}

export type ParseItem =
  | { tag: "key"; key: string }
  | { tag: "pair"; key: string; value: ParseArg }
  | { tag: "punPair"; key: string }
  | { tag: "method"; params: ParseItem[]; body: ParseStmt[] }
// TODO: multiple method heads, decorators

function item(lexer: Lexer): ParseItem | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "openBrace": {
      lexer.advance()
      const params = repeat(lexer, item)
      mustToken(lexer, "closeBrace")
      const body = repeat(lexer, stmt)
      return { tag: "method", params, body }
    }
    case "quotedIdent":
      lexer.advance()
      return { tag: "punPair", key: token.value }
    case "colon": {
      lexer.advance()
      const value = must(lexer, "arg", arg)
      return { tag: "pair", key: "", value }
    }
    default: {
      const key = lexer.acceptKey()
      if (!key) return null
      if (accept(lexer, "colon")) {
        const value = must(lexer, "arg", arg)
        return { tag: "pair", key: key || "", value }
      } else {
        return { tag: "key", key }
      }
    }
  }
}

// used for both ast exprs and bindings
export type ParseExpr =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "parens"; value: ParseExpr }
  | { tag: "object"; items: ParseItem[] }
  | { tag: "call"; target: ParseExpr; items: ParseItem[] }
  | { tag: "use"; value: string }
  | { tag: "unaryOp"; target: ParseExpr; operator: string }
  | { tag: "binaryOp"; target: ParseExpr; arg: ParseExpr; operator: string }

function baseExpr(lexer: Lexer): ParseExpr | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "self":
      lexer.advance()
      return { tag: "self" }
    case "integer":
      lexer.advance()
      return { tag: "integer", value: token.value }
    case "string":
      lexer.advance()
      return { tag: "string", value: token.value }
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return { tag: "identifier", value: token.value }
    case "openParen": {
      lexer.advance()
      const value = must(lexer, "expr", expr)
      mustToken(lexer, "closeParen")
      return { tag: "parens", value }
    }
    case "openBracket": {
      lexer.advance()
      const items = repeat(lexer, item)
      mustToken(lexer, "closeBracket")
      return { tag: "object", items }
    }
    case "use": {
      lexer.advance()
      const value =
        accept(lexer, "quotedIdent") || mustToken(lexer, "identifier")
      return { tag: "use", value: value.value }
    }
    default:
      return null
  }
}

function callExpr(lexer: Lexer): ParseExpr | null {
  let target = baseExpr(lexer)
  if (!target) return null
  while (true) {
    if (!accept(lexer, "openBrace")) return target
    const items = repeat(lexer, item)
    mustToken(lexer, "closeBrace")
    target = { tag: "call", target, items }
  }
}

function unaryOpExpr(lexer: Lexer): ParseExpr | null {
  const op = accept(lexer, "operator")
  if (!op) return callExpr(lexer)
  const target = must(lexer, "expr", unaryOpExpr)
  return { tag: "unaryOp", operator: op.value, target }
}

function binaryOpExpr(lexer: Lexer): ParseExpr | null {
  let target = unaryOpExpr(lexer)
  if (!target) return null
  while (true) {
    const op = accept(lexer, "operator")
    if (!op) return target
    const arg = must(lexer, "expr", unaryOpExpr)
    target = { tag: "binaryOp", target, operator: op.value, arg }
  }
}

function expr(lexer: Lexer): ParseExpr | null {
  const value = binaryOpExpr(lexer)
  if (!value) return null
  accept(lexer, "semicolon")
  return value
}

export type ParseStmt =
  | { tag: "let"; binding: ParseExpr; value: ParseExpr }
  | { tag: "set"; binding: ParseExpr; value: ParseExpr }
  | { tag: "var"; binding: ParseExpr; value: ParseExpr }
  | { tag: "provide"; binding: ParseExpr; value: ParseExpr }
  | { tag: "import"; binding: ParseExpr; value: ParseExpr }
  | { tag: "return"; value: ParseExpr }
  | { tag: "expr"; value: ParseExpr }

function stmt(lexer: Lexer): ParseStmt | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "let":
    case "set":
    case "var":
    case "provide":
    case "import": {
      lexer.advance()
      const binding = must(lexer, "binding", expr)
      mustToken(lexer, "colonEquals")
      const value = must(lexer, "expr", expr)
      return { tag: token.tag, binding, value }
    }
    case "return":
      lexer.advance()
      return { tag: "return", value: must(lexer, "expr", expr) }
    default: {
      const value = expr(lexer)
      if (!value) return null
      return { tag: "expr", value }
    }
  }
}

export function program(lexer: Lexer): ParseStmt[] {
  const out = repeat(lexer, stmt)
  mustToken(lexer, "end")
  return out
}

// utils

function repeat<T>(lexer: Lexer, parser: (l: Lexer) => T | null): T[] {
  const out: T[] = []
  let lastToken = lexer.peek()
  while (true) {
    const res = parser(lexer)
    if (res === null) break
    out.push(res)
    if (lexer.peek() === lastToken) {
      throw new Error(`stuck at token ${JSON.stringify(lastToken)}`)
    }
    lastToken = lexer.peek()
  }
  return out
}

function accept<Tag extends Token["tag"]>(
  lexer: Lexer,
  tag: Tag
): (Token & { tag: Tag }) | null {
  const token = lexer.peek()
  if (token.tag === tag) {
    lexer.advance()
    return token as Token & { tag: Tag }
  }
  return null
}

function mustToken<Tag extends Token["tag"]>(
  lexer: Lexer,
  tag: Tag
): Token & { tag: Tag } {
  const token = lexer.peek()
  if (tag === token.tag) {
    lexer.advance()
    return token as Token & { tag: Tag }
  }

  throw new Error(`Expected ${tag}, received ${token.tag}`)
}

function must<T>(
  lexer: Lexer,
  name: string,
  parser: (l: Lexer) => T | null
): T {
  const res = parser(lexer)
  if (res === null) {
    throw new Error(`Expected ${name}, received ${lexer.peek().tag}`)
  }
  return res
}
