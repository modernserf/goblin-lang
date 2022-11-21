const test = require("node:test")
import assert from "node:assert/strict"
import { run } from "./index"
import { ArgMismatchError, NoHandlerError, NoProviderError } from "./error"

test("panic", () => {
  assert.throws(() => {
    run(`
      import [_Panic_] := "core"
      Panic{message: "error message"}
    `)
  }, new Error("error message"))
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
      using{value that doesn't exist: x}
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
        on {do method: do b} 
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
        on {do method: do b}
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
        on {do method: do b}
          b{: 1}
        {}
      ]

      var v := 1
      obj{normal method: var v}
    `)
  }, ArgMismatchError)
})
