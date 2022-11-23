import assert from "node:assert/strict"
import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { coreModule } from "./compiler"

import { readFileSync } from "fs"
import { IRClass, ObjectValue, PrimitiveValue, unit } from "./value"

import {
  intClass,
  intValue,
  strValue,
  trueVal,
  falseVal,
  boolValue,
  IRClassBuilder,
} from "./primitive"
import { IRStmt } from "./interface"

const cellInstance = new IRClassBuilder()
  .addPrimitive("get", (self) => self.value)
  .addPrimitive("set:", (self, [arg]) => {
    self.value = arg
    return unit
  })
  .build()

const cellModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive(":", (_, [arg]) => {
      return new PrimitiveValue(cellInstance, { value: arg })
    })
    .build(),
  []
)

export class IndexOutOfRangeError {}
export class EmptyArrayError {}

const arrayInstance: IRClass = new IRClassBuilder()
  .addPrimitive("length", (self) => {
    return new PrimitiveValue(intClass, self.length)
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
    return new PrimitiveValue(arrayInstance, self)
  })
  .addPrimitive(",:", (self, [value]) => {
    self.push(value)
    return new PrimitiveValue(arrayInstance, self)
  })
  .addPrimitive("push:", (self, [value]) => {
    self.push(value)
    return new PrimitiveValue(arrayInstance, self)
  })
  .addPrimitive("pop", (self, []) => {
    if (self.length === 0) throw new EmptyArrayError()
    return self.pop()
  })
  .addPrimitive("copy", (self) => {
    return new PrimitiveValue(arrayInstance, self.slice())
  })
  // todo: error handling, `from:`, `to:`
  .addPrimitive("from:to:", (self, [from, to]) => {
    const f = intValue(from)
    const t = intValue(to)
    return new PrimitiveValue(arrayInstance, self.slice(f, t))
  })
  .build()

const arrayModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive("", () => {
      return new PrimitiveValue(arrayInstance, [])
    })
    .build(),
  []
)

const assertModule = new ObjectValue(
  new IRClassBuilder()
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
    })
    .build(),
  []
)

const panicModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive("message:", (_, [message]) => {
      throw new Error(strValue(message))
    })
    .build(),
  []
)
const nativeClass = new IRClassBuilder()
  .addConst("Cell", cellModule)
  .addConst("Array", arrayModule)
  .addConst("Assert", assertModule)
  .addConst("Panic", panicModule)
  .addConst("true", trueVal)
  .addConst("false", falseVal)
  .build()

const native = new PrimitiveValue(nativeClass, null)

export function compileCore(): IRStmt[] {
  const source = readFileSync("./src/core.gob", { encoding: "utf-8" })

  // TODO: compile injects a `native` object that's referenced by all the native methods
  return coreModule(parse(new Lexer(source)), native)
}
