const test = require("node:test")
import assert from "node:assert/strict"
import { run } from "./index"
import { PrimitiveTypeError } from "./primitive"

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
    run(`"foo" ++ 1`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1 & 1.0`)
  }, PrimitiveTypeError)
  assert.throws(() => {
    run(`1 >= "foo"`)
  }, PrimitiveTypeError)
})
