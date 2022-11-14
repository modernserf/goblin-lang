import assert from "node:assert/strict"
import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { coreModule } from "./compiler"

import { readFileSync } from "fs"
import { IRClass, IRStmt, unit, Value } from "./interpreter"
import {
  intClass,
  intValue,
  IRClassBuilder,
  strValue,
  trueVal,
  falseVal,
} from "./primitive"

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

const arrayInstance: IRClass = new IRClassBuilder()
  .addPrimitive("length", (self) => {
    return { tag: "primitive", class: intClass, value: self.length }
  })
  .addPrimitive("at:", (self, [index]) => {
    const i = intValue(index)
    if (self.length <= i) throw new Error("index out of range")
    return self[i]
  })
  .addPrimitive("at:value:", (self, [index, value]) => {
    const i = intValue(index)
    if (self.length <= i) throw new Error("index out of range")
    self[i] = value
    return { tag: "primitive", class: arrayInstance, value: self }
  })
  .addPrimitive("push:", (self, [value]) => {
    self.push(value)
    return { tag: "primitive", class: arrayInstance, value: self }
  })
  .addPrimitive("pop", (self, []) => {
    if (self.length === 0) throw new Error("array empty")
    return self.pop()
  })
  .addPrimitive("copy", (self) => {
    return { tag: "primitive", class: arrayInstance, value: self.slice() }
  })
  .addPrimitive("from:to:", (self, [from, to]) => {
    const f = intValue(from)
    const t = intValue(to)
    // todo: more error handling
    return { tag: "primitive", class: arrayInstance, value: self.slice(f, t) }
  })
  .build()

const arrayModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClassBuilder()
    .addPrimitive("", () => {
      return { tag: "primitive", class: arrayInstance, value: [] }
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

const panicModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClassBuilder()
    .addPrimitive("message:", (_, [message]) => {
      throw new Error(strValue(message))
    })
    .build(),
}

const nativeClass = new IRClassBuilder()
  .addPrimitive("Cell", () => cellModule)
  .addPrimitive("Array", () => arrayModule)
  .addPrimitive("Assert", () => assertModule)
  .addPrimitive("Panic", () => panicModule)
  .addPrimitive("true", () => trueVal)
  .addPrimitive("false", () => falseVal)
  .build()

const native: Value = { tag: "primitive", class: nativeClass, value: null }

export function compileCore(): IRStmt[] {
  const source = readFileSync("./src/core.gob", { encoding: "utf-8" })

  // TODO: compile injects a `native` object that's referenced by all the native methods
  return coreModule(astWalk(parse(new Lexer(source))), native)
}
