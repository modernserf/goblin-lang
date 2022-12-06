const test = require("node:test")
import assert from "node:assert/strict"
import { run } from "./index"
import {
  PrimitiveTypeError,
  IndexOutOfRangeError,
  EmptyArrayError,
} from "./primitive"

test("primitive methods", () => {
  assert.throws(() => {
    run(`1 + "hello"`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1 + [x: 2]`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`(1 = 1) && 1`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1.0 + "hello"`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1 & 1.0`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1 >= "foo"`)
  }, PrimitiveTypeError)
})

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
