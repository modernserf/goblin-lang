const test = require("node:test")
import { readFile } from "node:fs/promises"
import "./parser.test"
import "./compiler.test"
import "./interpreter.test"
import "./primitive.test"
import "./core.test"
import { run } from "./index"

function testFile(name: string, path: string) {
  test(name, async () => {
    const file = await readFile(path, { encoding: "utf-8" })
    run(file)
  })
}

testFile("primitives", "./src/primitive.test.gob")
testFile("structures", "./src/structures.test.gob")
testFile("params", "./src/params.test.gob")
testFile("test file", "./src/test.gob")
