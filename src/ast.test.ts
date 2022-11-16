const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import {
  DuplicateElseHandlerError,
  DuplicateKeyError,
  DuplicateHandlerError,
  InvalidDestructuringError,
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidImportSourceError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidSetTargetError,
  InvalidVarArgError,
  InvalidVarBindingError,
  program as astWalk,
} from "./ast"
import { InvalidDoParamError, InvalidVarParamError } from "./ast-parser"

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
  assert.throws(() => {
    check(`
      set x + 1
    `)
  }, InvalidSetTargetError)
  assert.doesNotThrow(() => {
    check(`
      set x{+: 1}
    `)
  })
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
      let [x: else 1] := foo
    `)
  }, InvalidDestructuringError)
})

test("provide/using", () => {
  assert.doesNotThrow(() => {
    check(`
      let x := 1
      provide{_x_}
      using{_x_}
    `)
  })

  assert.throws(() => {
    check(`
      provide{x}
    `)
  }, InvalidProvideBindingError)
  assert.throws(() => {
    check(`
      using{x}
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
      [{arg: do [x: x]} x] 
    `)
  }, InvalidDoParamError)
})

test("frames", () => {
  assert.throws(() => {
    check(`
      [x: var 1] 
    `)
  }, InvalidFrameArgError)
})

test("todo: sub-pattern", () => {
  assert.throws(() => {
    check(`
      let obj := [
        on {foo: {bar: baz}}
          baz
      ]
    `)
  })
})

test("default values", () => {
  assert.throws(() => {
    check(`
      let obj := [
        on {} 1
        on {x: x := 0 y: y := 0}
          x + y
      ]
    `)
  }, DuplicateHandlerError)
})
