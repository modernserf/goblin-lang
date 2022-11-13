import assert from "node:assert/strict"
import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { coreModule } from "./compiler"

import { readFileSync } from "fs"
import { IRStmt, unit, Value } from "./interpreter"
import { IRClassBuilder } from "./primitive"

const cellInstance = new IRClassBuilder()
  .addPrimitive("get", (self) => self.value)
  .addPrimitive("set:", (self, [arg]) => {
    self.value = arg
    return unit
  })
  .build()

const cellModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClassBuilder()
    .addPrimitive(":", (_, [arg]) => {
      return { tag: "primitive", class: cellInstance, value: { value: arg } }
    })
    .build(),
}

const assertModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClassBuilder()
    .addPrimitive("expected:received:", (_, [exp, recv]) => {
      assert.deepEqual(recv, exp)
      return unit
    })
    .build(),
}

const nativeClass = new IRClassBuilder()
  .addPrimitive("Cell", () => cellModule)
  .addPrimitive("Assert", () => assertModule)
  .build()

const native: Value = { tag: "primitive", class: nativeClass, value: null }

export function compileCore(): IRStmt[] {
  const source = readFileSync("./src/core.gob", { encoding: "utf-8" })

  // TODO: compile injects a `native` object that's referenced by all the native methods
  return coreModule(astWalk(parse(new Lexer(source))), native)
}
