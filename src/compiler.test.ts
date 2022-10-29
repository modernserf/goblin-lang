const test = require("node:test")
import assert from "node:assert/strict"

import { Expr, Statement } from "./parser-2"
import { Compiler, IRExpr, IRStmt, intClass, stringClass } from "./compiler"
function expr(expr: Expr): IRExpr {
  return new Compiler().expr(expr)
}
function program(program: Statement[]): IRStmt[] {
  return new Compiler().program(program)
}

test("empty program", () => {
  assert.deepEqual(program([]), [])
})

test("primitives", () => {
  assert.deepEqual(expr({ tag: "number", value: 123 }), {
    tag: "primitive",
    value: 123,
    class: intClass,
  })
  assert.deepEqual(expr({ tag: "string", value: "hello" }), {
    tag: "primitive",
    value: "hello",
    class: stringClass,
  })
})
