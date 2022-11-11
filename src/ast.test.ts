const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import {
  DuplicateElseHandlerError,
  DuplicateKeyError,
  DuplicateHandlerError,
  InvalidBlockArgError,
  InvalidBlockParamError,
  InvalidDestructuringError,
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidImportSourceError,
  InvalidLetBindingError,
  InvalidParamError,
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
        on {x: arg} arg
        on {x: arg} arg
      ]
    `)
  }, DuplicateHandlerError)
  assert.throws(() => {
    check(`
      [
        else 1
        else 2
      ]
    `)
  }, DuplicateElseHandlerError)
})

test("invalid calls", () => {
  assert.throws(() => {
    check(`
      val{arg: var 1} 
    `)
  }, InvalidVarArgError)
  assert.throws(() => {
    check(`
      val{arg: block 1} 
    `)
  }, InvalidBlockArgError)
})

test("invalid destructuring", () => {
  assert.throws(() => {
    check(`
      let [x] := foo
    `)
  }, InvalidDestructuringError)
  assert.throws(() => {
    check(`
      let [x: var x] := foo
    `)
  }, InvalidDestructuringError)
  assert.throws(() => {
    check(`
      let [x: block x] := foo
    `)
  }, InvalidDestructuringError)
  assert.throws(() => {
    check(`
      let [x: else 1] := foo
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

test("method params", () => {
  assert.throws(() => {
    check(`
      [{arg: var 1} 1]
    `)
  }, InvalidVarParamError)
  assert.throws(() => {
    check(`
      [{arg: on {x} 1} 1]
    `)
  }, InvalidParamError)
  assert.throws(() => {
    check(`
      [{arg: block [x: x]} x] 
    `)
  }, InvalidBlockParamError)
})

test("frames", () => {
  assert.throws(() => {
    check(`
      [x: var 1] 
    `)
  }, InvalidFrameArgError)
})
