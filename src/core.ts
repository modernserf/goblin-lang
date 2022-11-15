import assert from "node:assert/strict"
import { Lexer } from "./lexer"
import { program as parse } from "./parser"
import { program as astWalk } from "./ast"
import { coreModule } from "./compiler"

import { readFileSync } from "fs"
import {
  IRClass,
  IRStmt,
  ObjectValue,
  PrimitiveValue,
  unit,
  Value,
} from "./interpreter"
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

const cellModule = new ObjectValue(
  new IRClass().addPrimitive(":", (_, [arg]) => {
    return new PrimitiveValue(cellInstance, { value: arg })
  }),
  []
)

export class IndexOutOfRangeError {}
export class EmptyArrayError {}

const arrayInstance: IRClass = new IRClass()
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

const arrayModule = new ObjectValue(
  new IRClass().addPrimitive("", () => {
    return new PrimitiveValue(arrayInstance, [])
  }),
  []
)

const assertModule = new ObjectValue(
  new IRClass()
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
  []
)

const panicModule = new ObjectValue(
  new IRClass().addPrimitive("message:", (_, [message]) => {
    throw new Error(strValue(message))
  }),
  []
)
const nativeClass = new IRClass()
  .addPrimitive("Cell", () => cellModule)
  .addPrimitive("Array", () => arrayModule)
  .addPrimitive("Assert", () => assertModule)
  .addPrimitive("Panic", () => panicModule)
  .addPrimitive("true", () => trueVal)
  .addPrimitive("false", () => falseVal)

const native: Value = new PrimitiveValue(nativeClass, null)

export function compileCore(): IRStmt[] {
  const source = readFileSync("./src/core.gob", { encoding: "utf-8" })

  // TODO: compile injects a `native` object that's referenced by all the native methods
  return coreModule(astWalk(parse(new Lexer(source))), native)
}
