const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import {
  BlockReferenceError,
  NoModuleSelfError,
  NotVarError,
  OuterScopeVarError,
  ReferenceError,
  VarDoubleBorrowError,
} from "./scope"
import { DuplicateExportError, program, ScopedExportError } from "./compiler"
import { NoHandlerError } from "./interpreter"

export function compile(source: string) {
  const ast = parse(new Lexer(source))
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

test("var double borrow", () => {
  assert.throws(() => {
    compile(`
      var x := 1
      let fn := [{swap: var left with: var right}
        let tmp := left
        set left := right
        set right := left
      ]
      fn{swap: var x with: var x}
    `)
  }, VarDoubleBorrowError)

  assert.throws(() => {
    compile(`
      var x := 1
      let fn := [{arg: var arg block: do block}
      ]
      fn{arg: var x block: {}
        set x := 2
      }
    `)
  }, VarDoubleBorrowError)
  assert.throws(() => {
    compile(`
      var x := 1
      let fn := [{arg: var arg block: do block}
      ]
      fn{arg: var x block: {}
        let y := x
      }
    `)
  }, VarDoubleBorrowError)
  assert.throws(() => {
    compile(`
      var fn := [{arg: var arg}]
      fn{arg: var fn}
    `)
  }, VarDoubleBorrowError)
})

test("self at module root", () => {
  assert.throws(() => {
    compile(`
      self 
    `)
  }, NoModuleSelfError)
  assert.throws(() => {
    compile(`
      self{foo}
    `)
  }, NoModuleSelfError)
})

test("do usage", () => {
  assert.throws(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: do b} b
      ] 
    `)
  }, BlockReferenceError)

  assert.throws(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: do b}
          let baz := b
          1
      ] 
    `)
  }, BlockReferenceError)

  assert.throws(() => {
    compile(`
      let obj := [
        on {: do f} [
          on {inner}
            f{: 1} 
        ]
      ] 
    `)
  }, BlockReferenceError)

  assert.doesNotThrow(() => {
    compile(`
      let foo := []
      let bar := [
        {foo: do b} foo{: b}
      ] 
    `)
  })
})

test("selfDirect", () => {
  assert.throws(() => {
    compile(`
      let foo := [
        on {x}
          self{y}
      ]
    `)
  }, NoHandlerError)
})

test("exports", () => {
  assert.throws(() => {
    compile(`
      let foo := [
        on {x}
          export let x := 1
      ]
    `)
  }, ScopedExportError)
  assert.throws(() => {
    compile(`
      export let x := 1
      export let x := 2
    `)
  }, DuplicateExportError)
  assert.doesNotThrow(() => {
    compile(`
      export let x := 1
    `)
  })
})

test("todo: provide/using var/do", () => {
  assert.throws(() => {
    compile(`
      var y := 1
      provide{y: var y}
    `)
  })
  assert.throws(() => {
    compile(`
      provide{z: {foo} 1}
    `)
  })
  assert.throws(() => {
    compile(`
      using{y: var y}
    `)
  })
  assert.throws(() => {
    compile(`
      using{z: do z}
    `)
  })
})
