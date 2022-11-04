const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer, Token } from "./lexer"

function tokens(text: string): Token[] {
  return Array.from(new Lexer(text))
}

test("empty program", () => {
  assert.deepEqual(tokens(""), [])
})

test("strings", () => {
  assert.deepEqual(tokens(` "hello, world"`), [
    { tag: "string", value: "hello, world" },
  ])
})

test("primitives, whitespace, comments", () => {
  assert.deepEqual(
    tokens(`
      # this is a comment
      123
      # another comment
      "hello, world"
    `),
    [
      { tag: "integer", value: 123 },
      { tag: "string", value: "hello, world" },
    ]
  )
})

test("keywords, identifiers", () => {
  assert.deepEqual(
    tokens(`
      let lettuce return self _self_ _return self_
    `),
    [
      { tag: "let" },
      { tag: "identifier", value: "lettuce" },
      { tag: "return" },
      { tag: "self" },
      { tag: "quotedIdent", value: "self" },
      { tag: "quotedIdent", value: "return self" },
    ]
  )
})
