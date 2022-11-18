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
      parse("using 1")
    },
    ParseError,
    "using without message"
  )

  assert.throws(() => {
    parse(`
        val{arg: var 1} 
      `)
  }, ParseError)

  assert.throws(() => {
    parse(`
      [{arg: var 1} 1]
    `)
  }, ParseError)
  assert.throws(() => {
    parse(`
      [{arg: do [x: x]} x] 
    `)
  }, ParseError)

  assert.throws(() => {
    parse(`
      [x: var 1] 
    `)
  }, ParseError)

  assert.throws(() => {
    parse(`
      let 1 := foo
    `)
  }, ParseError)
  assert.throws(() => {
    parse(`
      var p := 1
      set [x: p] := [x: 2]
    `)
  }, ParseError)
})

test("other errors thrown at parse time", () => {
  assert.throws(() => {
    parse(`
      let x := [foo: bar baz]
    `)
  })
  assert.throws(() => {
    parse(`
      let x := [
        on {foo: bar baz} bar
      ]
    `)
  })
})
