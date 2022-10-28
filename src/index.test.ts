// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./lexer.test"
import "./parser.test"
import "./interpreter.test"
test("it works", () => {
  assert.equal(true, true)
})
