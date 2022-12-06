import assert from "node:assert/strict"
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
  stringClass,
  PrimitiveTypeError,
  boolClass,
} from "./primitive"
import { Value } from "./interface"

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
  .addPrimitive("at:swap:", (self, [left, right]) => {
    const l = intValue(left)
    const r = intValue(right)
    const tmp = self[l]
    self[l] = self[r]
    self[r] = tmp
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
  .addPrimitive("append:", (self, [other]) => {
    if (!other.instanceof(arrayInstance)) {
      throw new PrimitiveTypeError("array")
    }
    return new PrimitiveValue(arrayInstance, self.concat(other.primitiveValue))
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
    .addPrimitive(":", (_, [arg]) => {
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

const logModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive(":", (_, [message]) => {
      console.log(strValue(message))
      return unit
    })
    .build(),
  []
)

const fileModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive("read text sync:", (_, [filename]) => {
      const contents = readFileSync(strValue(filename), { encoding: "utf-8" })
      return new PrimitiveValue(stringClass, contents)
    })
    .build(),
  []
)

const loopModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive("loop:", (_, [fn], ctx) => {
      while (true) {
        fn.send(ctx, "", [], null)
      }
    })
    .build(),
  []
)

const stringModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive("from char code:", (_, [code]) => {
      const str = String.fromCharCode(intValue(code))
      return new PrimitiveValue(stringClass, str)
    })
    .build(),
  []
)

const debugModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive(":", (_, [val]) => {
      console.log(val)
      return unit
    })
    .build(),
  []
)

const bigIntClass: IRClass = new IRClassBuilder()
  .addPrimitive("=:", (self, [arg]) => {
    return new PrimitiveValue(boolClass, self === bigIntValue(arg))
  })
  .addPrimitive("!=:", (self, [arg]) => {
    return new PrimitiveValue(boolClass, self !== bigIntValue(arg))
  })
  .addPrimitive("&:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self & bigIntValue(arg))
  })
  .addPrimitive("|:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self | bigIntValue(arg))
  })
  .addPrimitive("<<:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self << bigIntValue(arg))
  })
  .addPrimitive(">>:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self >> bigIntValue(arg))
  })
  .addPrimitive("popcount", (self: bigint) => {
    let count = 0
    while (self !== 0n) {
      let n = Number(BigInt.asIntN(32, self))
      if (n !== 0) {
        n = n - ((n >> 1) & 0x55555555)
        n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
        n = (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24
        count += n
      }
      self = self >> 32n
    }
    return new PrimitiveValue(intClass, count)
  })
  .addPrimitive("to Int", (self) => {
    return new PrimitiveValue(intClass, Number(self))
  })
  .build()

function bigIntValue(value: Value): bigint {
  if (value.instanceof(bigIntClass)) {
    return value.primitiveValue
  }
  if (value.instanceof(intClass)) {
    return BigInt(value.primitiveValue)
  }
  throw new PrimitiveTypeError("(big) integer")
}

const bigIntModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive(":", (_, [arg]) => {
      const value = bigIntValue(arg)
      return new PrimitiveValue(bigIntClass, value)
    })
    .build(),
  []
)

const nativeClass = new IRClassBuilder()
  .addConst("String", stringModule)
  .addConst("Cell", cellModule)
  .addConst("Array", arrayModule)
  .addConst("Assert", assertModule)
  .addConst("Panic", panicModule)
  .addConst("Log", logModule)
  .addConst("File", fileModule)
  .addConst("true", trueVal)
  .addConst("false", falseVal)
  .addConst("loop", loopModule)
  .addConst("debug", debugModule)
  .addConst("bigint", bigIntModule)
  .build()

export const native = new PrimitiveValue(nativeClass, null)
