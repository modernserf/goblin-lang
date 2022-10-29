// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./parser-2.test"
import "./compiler.test"
test("it works", () => {
  assert.equal(true, true)
})
