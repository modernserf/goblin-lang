import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { program as compile } from "./compiler"

import { readFileSync } from "fs"
import { IRStmt } from "./interpreter"

export function enhancedCore(): IRStmt[] {
  const source = readFileSync("./src/stdlib.gob", { encoding: "utf-8" })
  // TODO: compile injects a `native` object that's referenced by all the native methods
  return compile(astWalk(parse(new Lexer(source))))
}
