const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import {
  BlockReferenceError,
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

test("block usage", () => {
  assert.throws(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: block b} foo{: b}
      ] 
    `)
  }, BlockReferenceError)

  assert.throws(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: block b} b
      ] 
    `)
  }, BlockReferenceError)

  assert.throws(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: block b}
          let baz := b
          1
      ] 
    `)
  }, BlockReferenceError)

  assert.doesNotThrow(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: block b} foo{: block b}
      ] 
    `)
  })

  assert.doesNotThrow(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: b} foo{: block b}
      ] 
    `)
  })
})
