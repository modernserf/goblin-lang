// Parse tree -- a loose grammar that covers the basic shape of the language

import { keywords, Lexer, Token } from "./lexer"

export type ParseStmt =
  | { tag: "let"; binding: ParseExpr; value: ParseExpr }
  | { tag: "set"; binding: ParseExpr; value: ParseExpr }
  | { tag: "var"; binding: ParseExpr; value: ParseExpr }
  | { tag: "provide"; binding: ParseExpr; value: ParseExpr }
  | { tag: "import"; binding: ParseExpr; value: ParseExpr }
  | { tag: "return"; value: ParseExpr }
  | { tag: "expr"; value: ParseExpr }

// used for both ast exprs and bindings
export type ParseExpr =
  | { tag: "self" }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "parens"; value: ParseExpr }
  | { tag: "object"; methods: ParseMethod[] }
  | { tag: "frame"; message: ParseMessage }
  | { tag: "send"; target: ParseExpr; message: ParseMessage }
  | { tag: "use"; value: string }
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
  | { tag: "block"; value: ParseExpr }
  | { tag: "case"; methods: ParseMethod[] }

// TODO: multiple method heads, decorators
export type ParseMethod = {
  tag: "method"
  message: ParseMessage
  body: ParseStmt[]
}

export class ParseError {
  constructor(readonly expected: string, readonly received: string) {}
}

function arg(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return { tag: "var", value: must(lexer, "expr", expr) }
    case "block":
      lexer.advance()
      return { tag: "block", value: must(lexer, "expr", expr) }
    case "case":
      return { tag: "case", methods: repeat(lexer, caseArg) }
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

function key_(lexer: Lexer): string {
  return repeat(lexer, keyPart).join(" ")
}

function message_(lexer: Lexer): ParseMessage {
  const pairs: ParsePair[] = []
  while (true) {
    const token = lexer.peek()
    if (token.tag === "quotedIdent") {
      lexer.advance()
      pairs.push({ tag: "punPair", key: token.value })
      continue
    }

    const key = key_(lexer)
    if (accept(lexer, "colon")) {
      const value = must(lexer, "arg", arg)
      pairs.push({ tag: "pair", key, value })
      continue
    }

    if (pairs.length) return { tag: "pairs", pairs }
    return { tag: "key", key }
  }
}

function caseArg(lexer: Lexer): ParseMethod | null {
  if (!accept(lexer, "case")) return null
  mustToken(lexer, "openBrace")
  const message = message_(lexer)
  mustToken(lexer, "closeBrace")
  const body = repeat(lexer, stmt)
  return { tag: "method", message, body }
}

function method(lexer: Lexer): ParseMethod | null {
  if (!accept(lexer, "openBrace")) return null
  const message = message_(lexer)
  mustToken(lexer, "closeBrace")
  const body = repeat(lexer, stmt)
  return { tag: "method", message, body }
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
      const methods = repeat(lexer, method)
      if (methods.length) {
        mustToken(lexer, "closeBracket")
        return { tag: "object", methods }
      }
      const message = message_(lexer)
      mustToken(lexer, "closeBracket")
      return { tag: "frame", message }
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
    const message = message_(lexer)
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
