const test = require("node:test")
import { readFile } from "node:fs/promises"
import "./parser.test"
import "./ast.test"
import "./compiler.test"
import "./interpreter.test"
import { run } from "./index"

test("test file", async () => {
  const file = await readFile("./src/test.gob", { encoding: "utf-8" })
  run(file)
})
