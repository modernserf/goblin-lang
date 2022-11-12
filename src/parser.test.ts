const test = require("node:test")
import assert from "node:assert/strict"
import { Lexer, LexerError } from "./lexer"
import { ParseError, program } from "./parser"

function parse(str: string) {
  const lexer = new Lexer(str)
  return program(lexer)
}

test("invalid tokens", () => {
  assert.throws(() => {
    parse("_unfinished quoted ident")
  }, LexerError)
  assert.throws(() => {
    parse(`"string with no end quote`)
  }, LexerError)
  assert.throws(() => {
    parse(`.`)
  }, LexerError)
})

test("parse errors", () => {
  assert.throws(
    () => {
      parse("(1")
    },
    ParseError,
    "unmatched paren"
  )
  assert.throws(
    () => {
      parse("(1 2)")
    },
    ParseError,
    "paren with too many values"
  )
  assert.throws(
    () => {
      parse("[hello")
    },
    ParseError,
    "unmatched bracket"
  )
  assert.throws(
    () => {
      parse("[{method]")
    },
    ParseError,
    "unmatched brace"
  )
  assert.throws(
    () => {
      parse("[hello:]")
    },
    ParseError,
    "colon without following arg"
  )

  assert.throws(
    () => {
      parse("foo{x: var}")
    },
    ParseError,
    "var without following arg"
  )
  assert.throws(
    () => {
      parse("use 1")
    },
    ParseError,
    "use without identifier"
  )
})
