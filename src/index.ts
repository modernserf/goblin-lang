import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { module, program as compile } from "./compiler"
import { program as interpret } from "./interpreter"
import { nativeModule } from "./primitive"
import { IRStmt } from "./interface"
import { readFileSync } from "fs"

function compileFile(file: string): IRStmt[] {
  const source = readFileSync(file, { encoding: "utf-8" })
  return module(parse(new Lexer(source)))
}

export function run(source: string) {
  const ast = parse(new Lexer(source))
  const ir = compile(ast)
  return interpret(
    ir,
    new Map([
      ["native", [nativeModule]],
      ["core", compileFile("./src/stdlib/core.gob")],
      ["core/control", compileFile("./src/stdlib/control.gob")],
      ["core/hash", compileFile("./src/stdlib/hash.gob")],
      ["core/iter", compileFile("./src/stdlib/iter.gob")],
      ["core/option", compileFile("./src/stdlib/option.gob")],
      ["core/ord", compileFile("./src/stdlib/ord.gob")],
      ["core/range", compileFile("./src/stdlib/range.gob")],
      ["core/result", compileFile("./src/stdlib/result.gob")],
      ["core/slice", compileFile("./src/stdlib/slice.gob")],
      ["core/sortable", compileFile("./src/stdlib/sortable.gob")],
      ["parse", compileFile("./src/stdlib/parse.gob")],
      ["bitset", compileFile("./src/stdlib/bitset.gob")],
    ])
  )
}
