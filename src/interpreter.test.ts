const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { program as compile } from "./compiler"
import {
  ArgMismatchError,
  program as interpret,
  NoHandlerError,
  NoProviderError,
  PrimitiveTypeError,
} from "./interpreter"

export function run(source: string) {
  const parseTree = parse(new Lexer(source))
  const ast = astWalk(parseTree)
  const ir = compile(ast)
  return interpret(ir)
}

test("primitive methods", () => {
  assert.throws(() => {
    run(`1 + "hello"`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`"hello" = 1`)
  }, PrimitiveTypeError)
})

test("no method", () => {
  assert.throws(() => {
    run(`
      let foo := [] 
      foo{some method that doesn't exist}
    `)
  }, NoHandlerError)
  assert.throws(() => {
    run(`
      let foo := [x: 1]
      foo{:
        on {some method} 1
      }
    `)
  }, NoHandlerError)
})

test("no provider", () => {
  assert.throws(() => {
    run(`
      use _value that doesn't exist_ 
    `)
  }, NoProviderError)
})

test("arg/param mismatch", () => {
  assert.throws(() => {
    run(`
      let obj := [
        on {normal method: value} 
          value
        on {var method: var x} 
          set x := 1
        on {block method: block b} 
          b{: 1}
        {}
      ]

      obj{var method: 1}
    `)
  }, ArgMismatchError)
  assert.throws(() => {
    run(`
      let obj := [
        on {normal method: value}
          value
        on {var method: var x}
          set x := 1
        on {block method: block b}
          b{: 1}
        {}
      ]

      obj{normal method: 
        on {x} 1
        on {y} 2
      }
    `)
  }, ArgMismatchError)
  assert.throws(() => {
    run(`
      let obj := [
        on {normal method: value}
          value
        on {var method: var x}
          set x := 1
        on {block method: block b}
          b{: 1}
        {}
      ]

      var v := 1
      obj{normal method: var v}
    `)
  }, ArgMismatchError)
})
