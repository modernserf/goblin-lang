import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { program as compile } from "./compiler"
import { program as interpret } from "./interpreter"

export function run(source: string) {
  const parseTree = parse(new Lexer(source))
  const ast = astWalk(parseTree)
  const ir = compile(ast)
  return interpret(ir)
}
