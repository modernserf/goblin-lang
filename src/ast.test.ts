const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import {
  DuplicateKeyError,
  DuplicateMethodError,
  InvalidCallStructureError,
  InvalidDestructuringError,
  InvalidFrameStructureError,
  InvalidImportBindingError,
  InvalidImportSourceError,
  InvalidLetBindingError,
  InvalidMethodError,
  InvalidMethodParamsError,
  InvalidProvideBindingError,
  InvalidSetTargetError,
  InvalidVarArgError,
  InvalidVarBindingError,
  InvalidVarParamError,
  program as astWalk,
} from "./ast"

export function check(source: string) {
  const parseTree = parse(new Lexer(source))
  return astWalk(parseTree)
}

test("duplicate keys", () => {
  assert.throws(() => {
    check(`[x: 1 x: 2]`)
  }, DuplicateKeyError)
})

test("invalid method params", () => {
  assert.throws(() => {
    check(`{x {y} 2}`)
  })
  assert.throws(() => {
    check(`[
      {x: x; {y: y}} y  
    ]`)
  }, InvalidMethodParamsError)
  assert.throws(() => {
    check(`[
      {x: x; y} 2
    ]`)
  }, InvalidMethodParamsError)
  assert.throws(() => {
    check(`[
      {x: var [a: arg]} arg
    ]`)
  }, InvalidVarParamError)
})

test("invalid object structure", () => {
  assert.throws(() => {
    check(`[x: 1 y]`)
  }, InvalidFrameStructureError)
  assert.throws(() => {
    check(`[x: 1; {y} 2]`)
  }, InvalidFrameStructureError)
  assert.throws(() => {
    check(`[{y} 2; x: 1]`)
  }, InvalidMethodError)
  assert.throws(() => {
    check(`[x {y} 2]`)
  })
  assert.throws(() => {
    check(`[x: var a]`)
  })
})

test("invalid bindings", () => {
  assert.throws(() => {
    check(`
      let 1 := foo
    `)
  }, InvalidLetBindingError)
  assert.throws(() => {
    check(`
      var [x: a y: b] := [x: 1 y: 2]
    `)
  }, InvalidVarBindingError)

  assert.throws(() => {
    check(`
      var p := 1
      set [x: p] := [x: 2]
    `)
  }, InvalidSetTargetError)
})

test("duplicate methods", () => {
  assert.throws(() => {
    check(`
      [
        {x: arg} arg;
        {x: arg} arg;
      ]
    `)
  }, DuplicateMethodError)
})

test("invalid calls", () => {
  assert.throws(() => {
    check(`
      val{arg: var 1} 
    `)
  }, InvalidVarArgError)

  assert.throws(() => {
    check(`
      val{x: 1 y} 
    `)
  }, InvalidCallStructureError)
})

test("invalid destructuring", () => {
  assert.throws(() => {
    check(`
      let [x] := foo
    `)
  }, InvalidDestructuringError)
  assert.throws(() => {
    check(`
      let [{x: 1} y] := foo
    `)
  }, InvalidDestructuringError)
  assert.throws(() => {
    check(`
      let [x: var x] := foo
    `)
  }, InvalidDestructuringError)
})

test("provide", () => {
  assert.throws(() => {
    check(`
      provide [x: 1] := foo
    `)
  }, InvalidProvideBindingError)
})

test("imports", () => {
  assert.throws(() => {
    check(`
      import foo := "bar" 
    `)
  }, InvalidImportBindingError)
  assert.throws(() => {
    check(`
      import [_foo_] := 123
    `)
  }, InvalidImportSourceError)
})
