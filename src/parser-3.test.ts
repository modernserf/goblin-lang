const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer, Token } from "./token"

type ASTBinding = { tag: "identifier"; value: string }

// TODO: also used for object destructuring fields
type ASTParam = { key: string; value: ASTBinding }

type ASTExpr =
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "self" }
  | { tag: "call"; target: ASTExpr; args: ASTCallArg[] }
  | { tag: "object"; args: ASTCallArg[] }

// TODO: used both for object literal & call, though methods are invalid syntax for calls
type ASTCallArg =
  | { tag: "key"; key: string }
  | { tag: "pair"; key: string; value: ASTExpr }
  | { tag: "method"; params: ASTParam[]; body: ASTStmt[] }

type ASTStmt =
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

function mustBinding(lexer: Lexer): ASTBinding {
  const value = binding(lexer)
  if (!value) throw new Error(`expected binding, got ${lexer.peek().tag}`)
  return value
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

function callArg(lexer: Lexer): ASTCallArg | null {
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
      const value = mustExpr(lexer)
      return { tag: "pair", key: "", value }
    }
    case "openBrace":
      throw new Error("todo methods")
    default: {
      const key = repeat(lexer, keyComponent).join(" ")
      if (lexer.peek().tag === "colon") {
        lexer.advance()
        const value = mustExpr(lexer)
        return { tag: "pair", key, value }
      } else if (key) {
        return { tag: "key", key }
      } else {
        return null
      }
    }
  }
}

function call(lexer: Lexer): ASTCallArg[] | null {
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

function expr(lexer: Lexer): ASTExpr | null {
  return callExpr(lexer)
}

function mustExpr(lexer: Lexer): ASTExpr {
  const value = expr(lexer)
  if (!value) throw new Error(`expected expr, got ${lexer.peek().tag}`)
  return value
}

function stmt(lexer: Lexer): ASTStmt | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "let": {
      lexer.advance()
      const bind = mustBinding(lexer)
      expect(lexer, "colonEquals")
      const value = mustExpr(lexer)
      return { tag: "let", binding: bind, value }
    }
    case "return": {
      lexer.advance()
      const value = mustExpr(lexer)
      return { tag: "return", value }
    }
    default: {
      const value = expr(lexer)
      if (!value) return null
      return { tag: "expr", value }
    }
  }
}

function program(lexer: Lexer): ASTStmt[] {
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
    if (!res) break
    out.push(res)
    if (lexer.peek() === lastToken) {
      throw new Error(`stuck at token ${JSON.stringify(lastToken)}`)
    }
    lastToken = lexer.peek()
  }
  return out
}

function expect(lexer: Lexer, tag: Token["tag"]): Token {
  const token = lexer.peek()
  if (tag !== token.tag) {
    throw new Error(`Expected ${tag}, received ${token.tag}`)
  }
  lexer.advance()
  return token
}

// test

function parse(code: string) {
  return program(new Lexer(code))
}

test("empty program", () => {
  assert.deepEqual(parse(""), [])
})

test("simple expressions", () => {
  assert.deepEqual(
    parse(`
      123
      "hello, world"
      foo _foo bar_
      self
  `),
    [
      { tag: "integer", value: 123 },
      { tag: "string", value: "hello, world" },
      { tag: "identifier", value: "foo" },
      { tag: "identifier", value: "foo bar" },
      { tag: "self" },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("parens", () => {
  assert.deepEqual(
    parse(`
      (123)
    `),
    [{ tag: "expr", value: { tag: "integer", value: 123 } }]
  )

  assert.throws(() => {
    parse(`(123`)
  })
})

test("calls", () => {
  assert.deepEqual(
    parse(`
    x{}
    x{foo}
    x{foo: 1}
    x{_foo_}
    x{foo: 1 bar: 2}
    x{: 1}
    x{foo: 1}{bar: 2}
  `),
    [
      { tag: "call", target: { tag: "identifier", value: "x" }, args: [] },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [{ tag: "key", key: "foo" }],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          {
            tag: "pair",
            key: "foo",
            value: { tag: "identifier", value: "foo" },
          },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [{ tag: "pair", key: "", value: { tag: "integer", value: 1 } }],
      },
      {
        tag: "call",
        target: {
          tag: "call",
          target: { tag: "identifier", value: "x" },
          args: [
            { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          ],
        },
        args: [
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("objects", () => {
  assert.deepEqual(
    parse(`
    []
    [foo bar]
    [_foo_ _bar_]
    [foo: 1 bar: 2]
    [:1 :2]
  `),
    [
      { tag: "object", args: [] },
      { tag: "object", args: [{ tag: "key", key: "foo bar" }] },
      {
        tag: "object",
        args: [
          {
            tag: "pair",
            key: "foo",
            value: { tag: "identifier", value: "foo" },
          },
          {
            tag: "pair",
            key: "bar",
            value: { tag: "identifier", value: "bar" },
          },
        ],
      },
      {
        tag: "object",
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
      {
        tag: "object",
        args: [
          { tag: "pair", key: "", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "", value: { tag: "integer", value: 2 } },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("let, return stmts", () => {
  assert.deepEqual(
    parse(`
      let x := 1
      let _value of y_ := 2
      return x
    `),
    [
      {
        tag: "let",
        binding: { tag: "identifier", value: "x" },
        value: { tag: "integer", value: 1 },
      },
      {
        tag: "let",
        binding: { tag: "identifier", value: "value of y" },
        value: { tag: "integer", value: 2 },
      },
      { tag: "return", value: { tag: "identifier", value: "x" } },
    ]
  )
})
