const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import {
  DuplicateBindingError,
  NoModuleSelfError,
  NotVarError,
  OuterScopeVarError,
  program,
  ReferenceError,
} from "./compiler"

export function compile(source: string) {
  const parseTree = parse(new Lexer(source))
  const ast = astWalk(parseTree)
  return program(ast)
}

test("duplicate let", () => {
  assert.throws(() => {
    compile(`
      let x := 1
      let x := 2
    `)
  }, DuplicateBindingError)
})

test("reference error", () => {
  assert.throws(() => {
    compile(`
      foo 
    `)
  }, ReferenceError)

  assert.throws(() => {
    compile(`
      [{arg: x} foo] 
    `)
  }, ReferenceError)

  assert.throws(() => {
    compile(`
      set x := 2
    `)
  }, ReferenceError)

  assert.throws(() => {
    compile(`
      let obj := [{arg: var x} 1]
      obj{arg: var foo}
    `)
  }, ReferenceError)
})

test("not a var", () => {
  assert.throws(() => {
    compile(`
      let x := 1
      set x := 2
      x
    `)
  }, NotVarError)

  // TODO: AST
  assert.throws(() => {
    compile(`
      var [x: a y: b] := [x: 1 y: 2]
    `)
  })

  // TODO: AST
  assert.throws(() => {
    compile(`
      var p := 1
      set [x: p] := [x: 2]
    `)
  })

  assert.throws(() => {
    compile(`
      var x := 1
      [
        {foo} x
      ]
    `)
  }, OuterScopeVarError)
})

test("self at module root", () => {
  assert.throws(() => {
    compile(`
      self 
    `)
  }, NoModuleSelfError)
})
