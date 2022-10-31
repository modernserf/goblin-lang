// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./parser-2.test"
import "./compiler.test"

import { run } from "./index"
test("hello world", () => {
  const res: any = run(`return "Hello, world!"`)
  assert.deepEqual(res.value, "Hello, world!")
})
