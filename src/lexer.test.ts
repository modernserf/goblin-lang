const test = require("node:test")
import assert from "node:assert/strict"

import { lexer } from "./lexer"

function lex(arr: TemplateStringsArray) {
  return [...lexer(arr[0])]
}

test("numbers", () => {
  assert.deepEqual(lex`1`, [{ tag: "number", value: "1" }])
})
