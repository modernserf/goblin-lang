import { Lexer, Token } from "./lexer"

export type ASTBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTStruct<ASTBinding> }

export type ASTExpr =
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "self" }
  | { tag: "call"; target: ASTExpr; args: ASTStruct<ASTExpr> }
  | { tag: "object"; args: ASTStruct<ASTExpr> }

export type ASTStmt =
  | { tag: "let"; binding: ASTBinding; value: ASTExpr }
  | { tag: "return"; value: ASTExpr }
  | { tag: "expr"; value: ASTExpr }

// Same shape used for method params, frame fields, method calls,
// though not all combinations are syntactically valid
export type ASTPair<Value> = { key: string; value: Value }
export type ASTMethod = { params: ASTStruct<ASTBinding>; body: ASTStmt[] }
export type ASTStruct<Value> =
  | { tag: "key"; selector: string }
  | { tag: "pairs"; selector: string; pairs: ASTPair<Value>[] }
  | { tag: "object"; methods: Map<string, ASTMethod> }

interface StructBuilder<Value> {
  key(key: string): StructBuilder<Value>
  pair(key: string, value: Value): StructBuilder<Value>
  method(params: ASTStruct<ASTBinding>, body: ASTStmt[]): StructBuilder<Value>
  build(): ASTStruct<Value>
}

export class BaseBuilder<T> implements StructBuilder<T> {
  key(key: string): StructBuilder<T> {
    return new KeyBuilder(key)
  }
  pair(key: string, value: T): StructBuilder<T> {
    const next = new PairBuilder<T>()
    return next.pair(key, value)
  }
  method(params: ASTStruct<ASTBinding>, body: ASTStmt[]): StructBuilder<T> {
    const next = new ObjectBuilder<T>()
    return next.method(params, body)
  }
  build(): ASTStruct<T> {
    return { tag: "pairs", selector: "", pairs: [] }
  }
}

export class KeyBuilder<T> implements StructBuilder<T> {
  constructor(private selector: string) {}
  key(key: string): StructBuilder<T> {
    throw new Error("duplicate key")
  }
  pair(key: string, value: T): StructBuilder<T> {
    throw new Error("cannot mix keys and pairs")
  }
  method(params: ASTStruct<ASTBinding>, body: ASTStmt[]): StructBuilder<T> {
    throw new Error("cannot mix keys and methods")
  }
  build(): ASTStruct<T> {
    return { tag: "key", selector: this.selector }
  }
}

export class PairBuilder<T> implements StructBuilder<T> {
  private map = new Map<string, T>()
  key(key: string): StructBuilder<T> {
    throw new Error("cannot mix keys and pairs")
  }
  pair(key: string, value: T): StructBuilder<T> {
    if (this.map.has(key)) throw new Error(`duplicate key ${key}`)
    this.map.set(key, value)
    return this
  }
  method(params: ASTStruct<ASTBinding>, body: ASTStmt[]): StructBuilder<T> {
    throw new Error("cannot mix pairs and methods")
  }
  build(): ASTStruct<T> {
    const pairs = Array.from(this.map.entries()).map(([key, value]) => ({
      key,
      value,
    }))
    pairs.sort((a, b) => a.key.localeCompare(b.key))
    const selector = pairs.map(({ key }) => `${key}:`).join("")
    return { tag: "pairs", selector, pairs }
  }
}

export class ObjectBuilder<T> implements StructBuilder<T> {
  private map = new Map<string, ASTMethod>()
  key(key: string): StructBuilder<T> {
    throw new Error("cannot mix keys and methods")
  }
  pair(key: string, value: T): StructBuilder<T> {
    throw new Error("cannot mix pairs and methods")
  }
  method(params: ASTStruct<ASTBinding>, body: ASTStmt[]): StructBuilder<T> {
    if (params.tag === "object") {
      throw new Error("method params must be key or pairs")
    }
    if (this.map.has(params.selector)) {
      throw new Error(`duplicate method ${params.selector}`)
    }
    this.map.set(params.selector, { params, body })
    return this
  }
  build(): ASTStruct<T> {
    return { tag: "object", methods: this.map }
  }
}

function structBinding(lexer: Lexer): ASTStruct<ASTBinding> {
  return struct<ASTBinding>(
    lexer,
    (value) => ({
      tag: "identifier",
      value: value,
    }),
    (lexer) => must(lexer, "binding", binding)
  )
}

function structExpr(lexer: Lexer): ASTStruct<ASTExpr> {
  return struct<ASTExpr>(
    lexer,
    (value) => ({
      tag: "identifier",
      value: value,
    }),
    (lexer) => must(lexer, "expr", expr)
  )
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

function struct<T>(
  lexer: Lexer,
  quotedIdent: (key: string) => T,
  parseValue: (lexer: Lexer) => T
): ASTStruct<T> {
  let builder = new BaseBuilder<T>()
  while (true) {
    const tok = lexer.peek()
    switch (tok.tag) {
      case "quotedIdent":
        lexer.advance()
        builder = builder.pair(tok.value, quotedIdent(tok.value))
        break
      case "colon": {
        lexer.advance()
        const value = parseValue(lexer)
        builder = builder.pair("", value)
        break
      }
      case "openBrace": {
        lexer.advance()
        const params = structBinding(lexer)
        expect(lexer, "closeBrace")
        const body = repeat(lexer, stmt)
        builder = builder.method(params, body)
        break
      }
      default: {
        const key = repeat(lexer, keyComponent).join(" ")
        if (lexer.peek().tag === "colon") {
          lexer.advance()
          const value = parseValue(lexer)
          builder = builder.pair(key, value)
        } else if (key) {
          builder = builder.key(key)
        } else {
          return builder.build()
        }
      }
    }
  }
}

function binding(lexer: Lexer): ASTBinding | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return { tag: "identifier", value: token.value }
    case "openBracket": {
      lexer.advance()
      const params = structBinding(lexer)
      expect(lexer, "closeBracket")
      return { tag: "object", params }
    }
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
      const args = structExpr(lexer)
      expect(lexer, "closeBracket")
      return { tag: "object", args }
    }
    default:
      return null
  }
}

function call(lexer: Lexer): ASTStruct<ASTExpr> | null {
  const tok = lexer.peek()
  if (tok.tag !== "openBrace") return null
  lexer.advance()
  const args = structExpr(lexer)
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
  return { tag: "call", target, args: { tag: "key", selector: tok.value } }
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
    return {
      tag: "call",
      target,
      args: { tag: "pairs", selector: `${op}:`, pairs: [{ key: op, value }] },
    }
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
