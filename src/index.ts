import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { module, program as compile } from "./compiler"
import { program as interpret } from "./interpreter"
import { native } from "./native"
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
      ["native", [native]],
      ["core", compileFile("./src/stdlib/core.gob")],
      ["parse", compileFile("./src/stdlib/parse.gob")],
    ])
  )
}
