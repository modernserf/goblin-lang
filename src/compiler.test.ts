const test = require("node:test")
import assert from "node:assert/strict"

import { Expr, Statement } from "./parser-2"
import { Compiler, IRExpr, IRStmt } from "./compiler"
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
    tag: "integer",
    value: 123,
  })
  assert.deepEqual(expr({ tag: "string", value: "hello" }), {
    tag: "string",
    value: "hello",
  })
})

test("local bindings", () => {
  assert.deepEqual(
    program([
      {
        tag: "let",
        binding: { tag: "identifier", value: "a" },
        expr: { tag: "number", value: 1 },
      },
      { tag: "expr", expr: { tag: "identifier", value: "a" } },
    ]),
    [
      {
        tag: "let",
        index: 0,
        expr: {
          tag: "integer",
          value: 1,
        },
      },
      { tag: "expr", expr: { tag: "local", index: 0 } },
    ]
  )
})
