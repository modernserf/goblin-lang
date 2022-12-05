import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as compile } from "./compiler"
import { program as interpret } from "./interpreter"
import { compileCore, compileFile } from "./core"

export function run(source: string) {
  const ast = parse(new Lexer(source))
  const ir = compile(ast)
  return interpret(
    ir,
    new Map([
      ["core", compileCore()],
      ["parse", compileFile("./src/stdlib/parse.gob")],
    ])
  )
}
