// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./token.test"
import "./parser-3.test"
// import "./compiler.test"
import { run } from "./index"

test("hello world", () => {
  const res: any = run(`return "Hello, world!"`)
  assert.deepEqual(res.value, "Hello, world!")
})

test("addition", () => {
  const res: any = run(`return 1 + 2`)
  assert.deepEqual(res.value, 3)
})

test("locals", () => {
  const res: any = run(`
    let x := 1
    let y := 2
    return x + y
  `)
  assert.deepEqual(res.value, 3)
})
