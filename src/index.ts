import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { program as compile } from "./compiler"
import { program as interpret } from "./interpreter"

import { core } from "./stdlib"
import { readFileSync } from "fs"
const stdlib = (() => {
  const source = readFileSync("./src/stdlib.gob", { encoding: "utf-8" })
  return compile(astWalk(parse(new Lexer(source))))
})()

export function run(source: string) {
  const parseTree = parse(new Lexer(source))
  const ast = astWalk(parseTree)
  const ir = compile(ast)
  return interpret(
    ir,
    new Map([
      [
        "core",
        [{ tag: "expr", value: { tag: "object", class: core, ivars: [] } }],
      ],
      ["core2", stdlib],
    ])
  )
}
