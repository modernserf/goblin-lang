const test = require("node:test")
import assert from "node:assert/strict"
import { Interpreter, toJS } from "./interpreter"
import { Expr } from "./parser"

function expr(expr: Expr): unknown {
  const interpreter = new Interpreter()
  const val = interpreter.expr(expr)
  return toJS(val)
}

test("numbers", () => {
  assert.deepEqual(expr({ tag: "number", value: 123 }), 123)
})

test("strings", () => {
  assert.deepEqual(
    expr({ tag: "string", value: "Hello, world" }),
    "Hello, world"
  )
})

test("string methods", () => {
  assert.deepEqual(
    expr({
      tag: "callTag",
      value: "to upper case",
      receiver: { tag: "string", value: "Hello, world" },
    }),
    "HELLO, WORLD"
  )
})
