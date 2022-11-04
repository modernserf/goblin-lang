import { Lexer, Token } from "./token"

export type ASTBinding = { tag: "identifier"; value: string }

// NOTE: also used for object destructuring fields
export type ASTParam =
  | { tag: "key"; key: string }
  | { tag: "pair"; key: string; value: ASTBinding }

export type ASTExpr =
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "self" }
  | { tag: "call"; target: ASTExpr; args: ASTArg[] }
  | { tag: "object"; args: ASTArg[] }

// NOTE: used both for object literal & call (though methods are invalid syntax for calls)
export type ASTArg =
  | { tag: "key"; key: string }
  | { tag: "pair"; key: string; value: ASTExpr }
  | { tag: "method"; params: ASTParam[]; body: ASTStmt[] }

export type ASTStmt =
  | { tag: "let"; binding: ASTBinding; value: ASTExpr }
  | { tag: "return"; value: ASTExpr }
  | { tag: "expr"; value: ASTExpr }

function binding(lexer: Lexer): ASTBinding | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return { tag: "identifier", value: token.value }
    default:
      return null
  }
}

function baseExpr(lexer: Lexer): ASTExpr | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "openParen": {
      lexer.advance()
      const value = expr(lexer)
      expect(lexer, "closeParen")
      return value
    }
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
    case "self":
      lexer.advance()
      return { tag: "self" }
    case "openBracket": {
      lexer.advance()
      const args = repeat(lexer, callArg)
      expect(lexer, "closeBracket")
      return { tag: "object", args }
    }
    default:
      return null
  }
}

function keyComponent(lexer: Lexer): string | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "operator":
      lexer.advance()
      return token.value
    case "integer":
      lexer.advance()
      return String(token.value)
    case "let":
    case "self":
    case "return":
      lexer.advance()
      return token.tag
    default:
      return null
  }
}

function methodParam(lexer: Lexer): ASTParam | null {
  const tok = lexer.peek()
  switch (tok.tag) {
    case "quotedIdent":
      lexer.advance()
      return {
        tag: "pair",
        key: tok.value,
        value: { tag: "identifier", value: tok.value },
      }
    case "colon": {
      lexer.advance()
      const value = must(lexer, "binding", binding)
      return { tag: "pair", key: "", value }
    }
    default:
      const key = repeat(lexer, keyComponent).join(" ")
      if (lexer.peek().tag === "colon") {
        lexer.advance()
        const value = must(lexer, "binding", binding)
        return { tag: "pair", key, value }
      } else if (key) {
        return { tag: "key", key }
      } else {
        return null
      }
  }
}

function callArg(lexer: Lexer): ASTArg | null {
  const tok = lexer.peek()
  switch (tok.tag) {
    case "quotedIdent":
      lexer.advance()
      return {
        tag: "pair",
        key: tok.value,
        value: { tag: "identifier", value: tok.value },
      }
    case "colon": {
      lexer.advance()
      const value = must(lexer, "expr", expr)
      return { tag: "pair", key: "", value }
    }
    case "openBrace": {
      lexer.advance()
      const params = repeat(lexer, methodParam)
      expect(lexer, "closeBrace")
      const body = repeat(lexer, stmt)
      return { tag: "method", params, body }
    }
    default: {
      const key = repeat(lexer, keyComponent).join(" ")
      if (lexer.peek().tag === "colon") {
        lexer.advance()
        const value = must(lexer, "expr", expr)
        return { tag: "pair", key, value }
      } else if (key) {
        return { tag: "key", key }
      } else {
        return null
      }
    }
  }
}

function call(lexer: Lexer): ASTArg[] | null {
  const tok = lexer.peek()
  if (tok.tag !== "openBrace") return null
  lexer.advance()
  const args = repeat(lexer, callArg)
  expect(lexer, "closeBrace")
  return args
}

function callExpr(lexer: Lexer): ASTExpr | null {
  const target = baseExpr(lexer)
  if (!target) return null
  return repeat(lexer, call).reduce((target, args) => {
    return { tag: "call", target, args }
  }, target)
}

function unaryOpExpr(lexer: Lexer): ASTExpr | null {
  const tok = accept(lexer, "operator")
  if (!tok) return callExpr(lexer)
  const target = must(lexer, "expr", unaryOpExpr)
  return { tag: "call", target, args: [{ tag: "key", key: tok.value }] }
}

function opPair(lexer: Lexer): { op: string; value: ASTExpr } | null {
  const tok = accept(lexer, "operator")
  if (!tok) return null
  const value = must(lexer, "expr", unaryOpExpr)
  return { op: tok.value, value }
}

function binaryOpExpr(lexer: Lexer): ASTExpr | null {
  const left = unaryOpExpr(lexer)
  if (!left) return null
  return repeat(lexer, opPair).reduce((target, { op, value }) => {
    return { tag: "call", target, args: [{ tag: "pair", key: op, value }] }
  }, left)
}

function expr(lexer: Lexer): ASTExpr | null {
  const res = binaryOpExpr(lexer)
  if (!res) return null
  accept(lexer, "semicolon")
  return res
}

function stmt(lexer: Lexer): ASTStmt | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "let": {
      lexer.advance()
      const bind = must(lexer, "binding", binding)
      expect(lexer, "colonEquals")
      const value = must(lexer, "expr", expr)
      return { tag: "let", binding: bind, value }
    }
    case "return": {
      lexer.advance()
      const value = must(lexer, "expr", expr)
      return { tag: "return", value }
    }
    default: {
      const value = expr(lexer)
      if (!value) return null
      return { tag: "expr", value }
    }
  }
}

export function program(lexer: Lexer): ASTStmt[] {
  const out = repeat(lexer, stmt)
  expect(lexer, "end")
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

function expect(lexer: Lexer, tag: Token["tag"]): Token {
  const token = lexer.peek()
  if (tag !== token.tag) {
    throw new Error(`Expected ${tag}, received ${token.tag}`)
  }
  lexer.advance()
  return token
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
