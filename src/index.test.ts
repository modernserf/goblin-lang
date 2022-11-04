// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./lexer.test"
import "./parser.test"
import { run } from "./index"

test("hello world", () => {
  const res: any = run(`return "Hello, world!"`)
  assert.deepEqual(res.value, "Hello, world!")
})

test.skip("addition", () => {
  const res: any = run(`return 1 + 2`)
  assert.deepEqual(res.value, 3)
})

test.skip("locals", () => {
  const res: any = run(`
    let x := 1
    let y := 2
    return x + y
  `)
  assert.deepEqual(res.value, 3)
})
