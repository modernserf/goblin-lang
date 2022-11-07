const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { program } from "./compiler"

export function compile(source: string) {
  const parseTree = parse(new Lexer(source))
  const ast = astWalk(parseTree)
  return program(ast)
}
