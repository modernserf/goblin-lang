const test = require("node:test")
import assert from "node:assert/strict"
import { EmptyArrayError, IndexOutOfRangeError } from "./native"
import { run } from "./index"

test("index out of range", () => {
  assert.throws(() => {
    run(`
      import [_Array_] := "core"
      let arr := Array{}
      arr{at: 100} 
    `)
  }, IndexOutOfRangeError)
  assert.throws(() => {
    run(`
      import [_Array_] := "core"
      let arr := Array{}
      arr{at: 100 value: 1} 
    `)
  }, IndexOutOfRangeError)
})

test("pop empty array", () => {
  assert.throws(() => {
    run(`
      import [_Array_] := "core"
      let arr := Array{}
      arr{pop} 
    `)
  }, EmptyArrayError)
})
