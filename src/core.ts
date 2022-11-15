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
  strValue,
  trueVal,
  falseVal,
  boolValue,
} from "./primitive"

const cellInstance = new IRClass()
  .addPrimitive("get", (self) => self.value)
  .addPrimitive("set:", (self, [arg]) => {
    self.value = arg
    return unit
  })

const cellModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClass().addPrimitive(":", (_, [arg]) => {
    return { tag: "primitive", class: cellInstance, value: { value: arg } }
  }),
}

export class IndexOutOfRangeError {}
export class EmptyArrayError {}

const arrayInstance: IRClass = new IRClass()
  .addPrimitive("length", (self) => {
    return { tag: "primitive", class: intClass, value: self.length }
  })
  // todo: do we want `at` index to wrap around?
  .addPrimitive("at:", (self, [index]) => {
    const i = intValue(index)
    if (self.length <= i) throw new IndexOutOfRangeError()
    return self[i]
  })
  .addPrimitive("at:value:", (self, [index, value]) => {
    const i = intValue(index)
    if (self.length <= i) throw new IndexOutOfRangeError()
    self[i] = value
    return { tag: "primitive", class: arrayInstance, value: self }
  })
  .addPrimitive(",:", (self, [value]) => {
    self.push(value)
    return { tag: "primitive", class: arrayInstance, value: self }
  })
  .addPrimitive("push:", (self, [value]) => {
    self.push(value)
    return { tag: "primitive", class: arrayInstance, value: self }
  })
  .addPrimitive("pop", (self, []) => {
    if (self.length === 0) throw new EmptyArrayError()
    return self.pop()
  })
  .addPrimitive("copy", (self) => {
    return { tag: "primitive", class: arrayInstance, value: self.slice() }
  })
  // todo: error handling, `from:`, `to:`
  .addPrimitive("from:to:", (self, [from, to]) => {
    const f = intValue(from)
    const t = intValue(to)
    return { tag: "primitive", class: arrayInstance, value: self.slice(f, t) }
  })

const arrayModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClass().addPrimitive("", () => {
    return { tag: "primitive", class: arrayInstance, value: [] }
  }),
}

const assertModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClass()
    .addPrimitive("expected:received:", (_, [exp, recv]) => {
      assert.deepEqual(recv, exp)
      return unit
    })
    .addPrimitive("true:", (_, [arg]) => {
      assert(boolValue(arg))
      return unit
    })
    .addPrimitive("false:", (_, [arg]) => {
      assert(boolValue(arg) === false)
      return unit
    }),
}

const panicModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClass().addPrimitive("message:", (_, [message]) => {
    throw new Error(strValue(message))
  }),
}

const nativeClass = new IRClass()
  .addPrimitive("Cell", () => cellModule)
  .addPrimitive("Array", () => arrayModule)
  .addPrimitive("Assert", () => assertModule)
  .addPrimitive("Panic", () => panicModule)
  .addPrimitive("true", () => trueVal)
  .addPrimitive("false", () => falseVal)

const native: Value = { tag: "primitive", class: nativeClass, value: null }

export function compileCore(): IRStmt[] {
  const source = readFileSync("./src/core.gob", { encoding: "utf-8" })

  // TODO: compile injects a `native` object that's referenced by all the native methods
  return coreModule(astWalk(parse(new Lexer(source))), native)
}
