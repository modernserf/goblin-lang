// Parse tree -- a loose grammar that covers the basic shape of the language

import { keywords, Lexer, Token } from "./lexer"

export type ParseStmt =
  | { tag: "let"; binding: ParseExpr; value: ParseExpr }
  | { tag: "set"; binding: ParseExpr; value: ParseExpr }
  | { tag: "var"; binding: ParseExpr; value: ParseExpr }
  | { tag: "provide"; binding: ParseExpr; value: ParseExpr }
  | { tag: "import"; binding: ParseExpr; value: ParseExpr }
  | { tag: "return"; value: ParseExpr }
  | { tag: "defer"; body: ParseStmt[] }
  | { tag: "expr"; value: ParseExpr }

// used for both ast exprs and bindings
export type ParseExpr =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "parens"; value: ParseExpr }
  | { tag: "object"; handlers: ParseHandler[] }
  | { tag: "frame"; message: ParseMessage }
  | { tag: "send"; target: ParseExpr; message: ParseMessage }
  | { tag: "use"; value: string }
  | { tag: "do"; body: ParseStmt[] }
  | { tag: "unaryOp"; target: ParseExpr; operator: string }
  | { tag: "binaryOp"; target: ParseExpr; arg: ParseExpr; operator: string }

export type ParseMessage =
  | { tag: "key"; key: string }
  | { tag: "pairs"; pairs: ParsePair[] }
export type ParsePair =
  | { tag: "pair"; key: string; value: ParseArg }
  | { tag: "punPair"; key: string }
export type ParseArg =
  | { tag: "value"; value: ParseExpr }
  | { tag: "var"; value: ParseExpr }
  | { tag: "do"; value: ParseExpr }
  | { tag: "handlers"; handlers: ParseHandler[] }

// TODO: multiple messages, decorators
export type ParseHandler =
  | { tag: "on"; message: ParseMessage; body: ParseStmt[] }
  | { tag: "else"; body: ParseStmt[] }

export class ParseError {
  constructor(readonly expected: string, readonly received: string) {}
}

type Parser<T> = (lexer: Lexer) => T

function param(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return { tag: "var", value: must(lexer, "expr", expr) }
    case "do":
      lexer.advance()
      return { tag: "do", value: must(lexer, "expr", expr) }
    case "on":
    case "else":
    case "openBrace":
      return { tag: "handlers", handlers: parseHandlers(lexer) }
    default:
      return { tag: "value", value: must(lexer, "expr", expr) }
  }
}

function arg(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return { tag: "var", value: must(lexer, "expr", expr) }
    case "on":
    case "else":
    case "openBrace":
      return { tag: "handlers", handlers: parseHandlers(lexer) }
    default:
      return { tag: "value", value: must(lexer, "expr", expr) }
  }
}

function keyPart(lexer: Lexer): string | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "operator":
      lexer.advance()
      return token.value
    case "integer":
      lexer.advance()
      return String(token.value)
    default:
      if (keywords.has(token.tag)) {
        lexer.advance()
        return token.tag
      }
      return null
  }
}

function parseKey(lexer: Lexer): string {
  return repeat(lexer, keyPart).join(" ")
}

function parseMessage(lexer: Lexer, parser: Parser<ParseArg>): ParseMessage {
  const pairs: ParsePair[] = []
  while (true) {
    const token = lexer.peek()
    if (token.tag === "quotedIdent") {
      lexer.advance()
      pairs.push({ tag: "punPair", key: token.value })
      continue
    }

    const key = parseKey(lexer)
    if (accept(lexer, "colon")) {
      const value = must(lexer, "arg", parser)
      pairs.push({ tag: "pair", key, value })
      continue
    }

    if (pairs.length) return { tag: "pairs", pairs }
    return { tag: "key", key }
  }
}

function parseHandlers(lexer: Lexer): ParseHandler[] {
  if (accept(lexer, "openBrace")) {
    const message = parseMessage(lexer, param)
    mustToken(lexer, "closeBrace")
    const body = repeat(lexer, stmt)
    return [{ tag: "on", message, body }]
  }
  const out: ParseHandler[] = []
  while (true) {
    if (accept(lexer, "else")) {
      const body = repeat(lexer, stmt)
      out.push({ tag: "else", body })
    } else if (accept(lexer, "on")) {
      mustToken(lexer, "openBrace")
      const message = parseMessage(lexer, param)
      mustToken(lexer, "closeBrace")
      const body = repeat(lexer, stmt)
      out.push({ tag: "on", message, body })
    } else {
      return out
    }
  }
}

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
      const handlers = parseHandlers(lexer)
      if (handlers.length) {
        mustToken(lexer, "closeBracket")
        return { tag: "object", handlers }
      }
      const message = parseMessage(lexer, arg)
      mustToken(lexer, "closeBracket")
      return { tag: "frame", message }
    }
    case "use": {
      lexer.advance()
      const value =
        accept(lexer, "quotedIdent") || mustToken(lexer, "identifier")
      return { tag: "use", value: value.value }
    }
    case "do": {
      lexer.advance()
      const body = repeat(lexer, stmt)
      mustToken(lexer, "end")
      return { tag: "do", body }
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
    const message = parseMessage(lexer, arg)
    mustToken(lexer, "closeBrace")
    target = { tag: "send", target, message }
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
    case "defer": {
      lexer.advance()
      const body = repeat(lexer, stmt)
      mustToken(lexer, "end")
      return { tag: "defer", body }
    }
    default: {
      const value = expr(lexer)
      if (!value) return null
      return { tag: "expr", value }
    }
  }
}

export function program(lexer: Lexer): ParseStmt[] {
  const out = repeat(lexer, stmt)
  mustToken(lexer, "eof")
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
    /* istanbul ignore next */
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

  throw new ParseError(tag, token.tag)
}

function must<T>(
  lexer: Lexer,
  name: string,
  parser: (l: Lexer) => T | null
): T {
  const res = parser(lexer)
  if (res === null) throw new ParseError(name, lexer.peek().tag)
  return res
}
