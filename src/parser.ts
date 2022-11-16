// Parse tree -- a loose grammar that covers the basic shape of the language

import { keywords, Lexer, Token } from "./lexer"
import {
  ParseArg,
  ParseExpr,
  ParseMessage,
  ParseHandler,
  ParsePair,
  ParseStmt,
  ParseParam,
  VarParam,
  DoParam,
  PatternParam,
  ValueParam,
  DefaultValueParam,
  VarArg,
  HandlersArg,
  ValueArg,
  OnHandler,
  ElseHandler,
} from "./ast-parser"

export class ParseError {
  constructor(readonly expected: string, readonly received: string) {}
}

type Parser<T> = (lexer: Lexer) => T

function param(lexer: Lexer): ParseParam {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return new VarParam(must(lexer, "expr", parseExpr))
    case "do":
      lexer.advance()
      return new DoParam(must(lexer, "expr", parseExpr))
    case "openBrace": {
      lexer.advance()
      const message = parseMessage(lexer, param)
      mustToken(lexer, "closeBrace")
      return new PatternParam(message)
    }
    default:
      const value = must(lexer, "binding", parseExpr)
      if (accept(lexer, "colonEquals")) {
        const defaultValue = must(lexer, "expr", parseExpr)
        return new DefaultValueParam(value, defaultValue)
      }
      return new ValueParam(value)
  }
}

function arg(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return new VarArg(must(lexer, "expr", parseExpr))
    case "on":
    case "else":
    case "openBrace":
      return new HandlersArg(parseHandlers(lexer))
    default:
      return new ValueArg(must(lexer, "expr", parseExpr))
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

function parseMessage<T>(lexer: Lexer, parser: Parser<T>): ParseMessage<T> {
  const pairs: ParsePair<T>[] = []
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

function parseHandlerMessage(lexer: Lexer): ParseMessage<ParseParam> | null {
  if (!accept(lexer, "openBrace")) return null
  const message = parseMessage(lexer, param)
  mustToken(lexer, "closeBrace")
  return message
}

function parseHandlers(lexer: Lexer): ParseHandler[] {
  if (lexer.peek().tag === "openBrace") {
    const messages = repeat1(lexer, "handler", parseHandlerMessage)
    const body = repeat(lexer, parseStmt)
    return messages.map((message) => new OnHandler(message, body))
  }
  const out: ParseHandler[] = []
  while (true) {
    if (accept(lexer, "else")) {
      const body = repeat(lexer, parseStmt)
      out.push(new ElseHandler(body))
    } else if (accept(lexer, "on")) {
      const messages = repeat1(lexer, "handler", parseHandlerMessage)
      const body = repeat(lexer, parseStmt)
      out.push(...messages.map((message) => new OnHandler(message, body)))
    } else {
      accept(lexer, "end")
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
    case "float":
      lexer.advance()
      return { tag: "float", value: token.value }
    case "string":
      lexer.advance()
      return { tag: "string", value: token.value }
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return { tag: "identifier", value: token.value }
    case "openParen": {
      lexer.advance()
      const value = parseExpr(lexer)
      mustToken(lexer, "closeParen")
      if (value) {
        return { tag: "parens", value }
      } else {
        return { tag: "unit" }
      }
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
      if (accept(lexer, "as")) {
        const as = must(lexer, "binding", parseExpr)
        return { tag: "frame", message, as }
      }
      return { tag: "frame", message, as: null }
    }
    case "do": {
      lexer.advance()
      const body = repeat(lexer, parseStmt)
      mustToken(lexer, "end")
      return { tag: "do", body }
    }
    case "if": {
      lexer.advance()
      const value = must(lexer, "expr", parseExpr)
      mustToken(lexer, "then")
      const body = repeat(lexer, parseStmt)
      const conds = [{ value, body }]
      while (true) {
        if (accept(lexer, "end")) {
          return { tag: "if", conds, else: [] }
        }
        mustToken(lexer, "else")
        if (accept(lexer, "if")) {
          const value = must(lexer, "expr", parseExpr)
          mustToken(lexer, "then")
          const body = repeat(lexer, parseStmt)
          conds.push({ value, body })
        } else {
          const body = repeat(lexer, parseStmt)
          mustToken(lexer, "end")
          return { tag: "if", conds, else: body }
        }
      }
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

function parseExpr(lexer: Lexer): ParseExpr | null {
  const value = binaryOpExpr(lexer)
  if (!value) return null
  accept(lexer, "semicolon")
  return value
}

function parseStmt(lexer: Lexer): ParseStmt | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "export": {
      lexer.advance()
      mustToken(lexer, "let")
      const binding = must(lexer, "binding", parseExpr)
      mustToken(lexer, "colonEquals")
      const value = must(lexer, "expr", parseExpr)
      return { tag: "let", binding, value, export: true }
    }
    case "let":
    case "var":
    case "import": {
      lexer.advance()
      const binding = must(lexer, "binding", parseExpr)
      mustToken(lexer, "colonEquals")
      const value = must(lexer, "expr", parseExpr)
      return { tag: token.tag, binding, value, export: false }
    }
    case "set": {
      lexer.advance()
      const binding = must(lexer, "binding", parseExpr)
      if (accept(lexer, "colonEquals")) {
        const value = must(lexer, "expr", parseExpr)
        return { tag: token.tag, binding, value }
      } else {
        return { tag: "setInPlace", binding }
      }
    }
    case "provide": {
      lexer.advance()
      mustToken(lexer, "openBrace")
      const message = parseMessage(lexer, arg)
      mustToken(lexer, "closeBrace")
      return { tag: "provide", message }
    }
    case "using": {
      lexer.advance()
      mustToken(lexer, "openBrace")
      const message = parseMessage(lexer, param)
      mustToken(lexer, "closeBrace")
      return { tag: "using", message }
    }
    case "return": {
      lexer.advance()
      const value = parseExpr(lexer)
      if (value) return { tag: "return", value }
      return { tag: "return", value: { tag: "unit" } }
    }
    case "defer": {
      lexer.advance()
      const body = repeat(lexer, parseStmt)
      mustToken(lexer, "end")
      return { tag: "defer", body }
    }
    default: {
      const value = parseExpr(lexer)
      if (!value) return null
      return { tag: "expr", value }
    }
  }
}

export function program(lexer: Lexer): ParseStmt[] {
  const out = repeat(lexer, parseStmt)
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

function repeat1<T>(
  lexer: Lexer,
  expected: string,
  parser: (l: Lexer) => T | null
): T[] {
  const first = must(lexer, expected, parser)
  const rest = repeat(lexer, parser)
  return [first, ...rest]
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
