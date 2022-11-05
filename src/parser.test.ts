const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { ASTExpr, ASTStmt, program } from "./parser"

// test

function parse(code: string) {
  return program(new Lexer(code))
}

test("empty program", () => {
  parse("")
})

test("simple expressions", () => {
  parse(`
    123
    "hello, world"
    foo _foo bar_
    self
  `)
})

test("parens", () => {
  parse(`(123)`)

  assert.throws(() => {
    parse(`(123`)
  })
})

test("calls", () => {
  parse(`
    x{}
    x{foo}
    x{foo: 1}
    x{_foo_}
    x{foo: 1 bar: 2}
    x{: 1}
    x{foo: 1}{bar: 2}
  `)
})

test("objects", () => {
  parse(`
  []
  [foo bar]
  [_foo_ _bar_]
  [foo: 1 bar: 2]
`)
})

test("let, return stmts", () => {
  parse(`
    let x := 1
    let _value of y_ := 2
    return x
  `)
})

test("var params", () => {
  parse(`
    let foo := [
      {x: var x} 
        set x := 1
        self
    ]
  `)
})

test("var args", () => {
  parse(`
    var bar := 1
    foo{x: var bar}
  `)
})

test("operators", () => {
  parse(`
    +x
    x + y
    x + +y; # disambiguate from "x + + y + x + y"
    +x + y
  `)
})

test("method definitons", () => {
  parse(`
    [{x} 1]
    [{x: y} y]
    [{_x_} x]
    [{: x} x]
    [{x: x y: y} y]
    [{x} 1; {y} 2]
  `)
})

test("destructuring", () => {
  parse(`
    let [x: a y: b] := foo
    let [_x_ _y_] := foo
  `)
  assert.throws(() => {
    parse(`
      let [x: a x: b] := foo
    `)
  })
})
