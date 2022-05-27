const test = require("node:test")
import assert from "node:assert/strict"

import { lexer } from "./lexer"

function lex(arr: TemplateStringsArray) {
  return [...lexer(arr.raw[0])]
}

test("comments", () => {
  assert.deepEqual(
    lex`
    ** this is a comment **
  
    ** begin
    * one star
    * end **

    ** this is too**
  `,
    []
  )
})

test("punctuation", () => {
  assert.deepEqual(lex`{[[.(:=:)]]}`, [
    { tag: "{" },
    { tag: "[" },
    { tag: "[." },
    { tag: "(" },
    { tag: ":=" },
    { tag: ":" },
    { tag: ")" },
    { tag: "]" },
    { tag: "]" },
    { tag: "}" },
  ])
})

test("numbers", () => {
  assert.deepEqual(lex`1`, [{ tag: "number", value: 1 }])
  assert.deepEqual(lex`123.45`, [{ tag: "number", value: 123.45 }])
  assert.deepEqual(lex`-123`, [{ tag: "number", value: -123 }])
  assert.deepEqual(lex`1_000`, [{ tag: "number", value: 1000 }])
  assert.deepEqual(lex`0xdeadBEEF`, [{ tag: "number", value: 0xdeadbeef }])
  assert.deepEqual(lex`0b1100_1001`, [{ tag: "number", value: 0b1100_1001 }])
})

test("strings", () => {
  assert.deepEqual(lex`"hello, world"`, [
    { tag: "string", value: "hello, world" },
  ])
  assert.deepEqual(lex`"hello, \"beautiful\" world"`, [
    { tag: "string", value: `hello, "beautiful" world` },
  ])
  assert.deepEqual(
    lex`
    "hello,
    world"
    `,
    [{ tag: "string", value: "hello,\n    world" }]
  )
})

test("identifiers", () => {
  assert.deepEqual(lex`_foo identifier_`, [
    { tag: "identifier", value: "foo identifier" },
  ])
  assert.deepEqual(lex`_  foo     identifier  _`, [
    { tag: "identifier", value: "foo identifier" },
  ])
})

test("cluster identifiers", () => {
  assert.deepEqual(lex`FooBar123`, [{ tag: "cluster", value: "FooBar123" }])
})

test("keywords", () => {
  assert.deepEqual(lex`foo bar`, [
    { tag: "keyword", value: "foo" },
    { tag: "keyword", value: "bar" },
  ])
})

test("operators", () => {
  assert.deepEqual(lex`[.. + ++ ..]`, [
    { tag: "[." },
    { tag: "operator", value: "." },
    { tag: "operator", value: "+" },
    { tag: "operator", value: "++" },
    { tag: "operator", value: ".." },
    { tag: "]" },
  ])
})
