const test = require("node:test")
import { readFile } from "node:fs/promises"
import "./parser.test"
import "./compiler.test"
import "./interpreter.test"
import "./primitive.test"
import { run } from "./index"

function testFile(name: string, path: string) {
  test(name, async () => {
    const file = await readFile(path, { encoding: "utf-8" })
    run(file)
  })
}

testFile("primitives", "./src/stdlib/primitive.test.gob")
testFile("structures", "./src/stdlib/structures.test.gob")
testFile("parser", "./src/stdlib/parse.test.gob")
testFile("params", "./src/stdlib/params.test.gob")
testFile("frame", "./src/stdlib/frame.test.gob")
testFile("range", "./src/stdlib/range.test.gob")
testFile("ord", "./src/stdlib/ord.test.gob")
testFile("option", "./src/stdlib/option.test.gob")
testFile("result", "./src/stdlib/result.test.gob")
testFile("control", "./src/stdlib/control.test.gob")
testFile("iter", "./src/stdlib/iter.test.gob")
testFile("vec", "./src/stdlib/vec.test.gob")
testFile("test file", "./src/test.gob")
