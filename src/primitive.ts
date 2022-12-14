import assert from "node:assert/strict"
import { readFileSync } from "fs"
import { Interpreter, IRHandler, Value } from "./interface"
import { IRModuleExpr } from "./ir-expr"
import { IRConstHandler, IRPrimitiveHandler, IRValueArg } from "./ir-handler"
import { unit, PrimitiveValue, IRClass, ObjectValue } from "./value"

export class IRClassBuilder {
  private handlers = new Map<string, IRHandler>()
  addConst(selector: string, value: Value): this {
    this.handlers.set(selector, new IRConstHandler(value))
    return this
  }
  addPrimitive(
    selector: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    this.handlers.set(selector, new IRPrimitiveHandler(fn))
    return this
  }
  build() {
    return new IRClass(this.handlers, null)
  }
}

export class PrimitiveTypeError {
  constructor(readonly expected: string) {}
}

export function boolValue(arg: Value): boolean {
  if (arg.instanceof(boolClass)) {
    return arg.primitiveValue
  }
  throw new PrimitiveTypeError("Bool")
}

export const boolClass: IRClass = new IRClassBuilder()
  .addPrimitive("debug", (self) => {
    return new PrimitiveValue(stringClass, self ? "true" : "false")
  })
  .addPrimitive(":", (self, [arg], ctx) => {
    const selector = self ? "true" : "false"
    return arg.send(ctx, selector, [], null)
  })
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.instanceof(boolClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("!=:", (self, [arg]) => {
    if (arg.instanceof(boolClass)) {
      return arg.primitiveValue !== self ? trueVal : falseVal
    }
    return trueVal
  })
  .addPrimitive("!", (self) => {
    return self ? falseVal : trueVal
  })
  // unlike in JS, we want these to check their arguments
  .addPrimitive("&&:", (self, [arg]) => {
    return boolValue(arg) && self ? trueVal : falseVal
  })
  .addPrimitive("||:", (self, [arg]) => {
    return boolValue(arg) || self ? trueVal : falseVal
  })
  .addPrimitive("hash", (self) => {
    return new PrimitiveValue(intClass, self ? 1 : 0)
  })
  .build()

export const trueVal = new PrimitiveValue(boolClass, true)
export const falseVal = new PrimitiveValue(boolClass, false)

export function strValue(arg: Value): string {
  if (arg.instanceof(stringClass)) {
    return arg.primitiveValue
  }
  throw new PrimitiveTypeError("String")
}

export const stringClass: IRClass = new IRClassBuilder()
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.instanceof(stringClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("!=:", (self, [arg]) => {
    if (arg.instanceof(stringClass)) {
      return arg.primitiveValue !== self ? trueVal : falseVal
    }
    return trueVal
  })
  .addPrimitive("debug", (self) => {
    return new PrimitiveValue(stringClass, self)
  })
  .addPrimitive("to String", (self) => {
    return new PrimitiveValue(stringClass, self)
  })
  .addPrimitive("++:", (self, [arg], ctx) => {
    let argAsStr = strValue(arg.send(ctx, "to String", [], null))
    return new PrimitiveValue(stringClass, `${self}${argAsStr}`)
  })
  .addPrimitive("length", (self) => {
    return new PrimitiveValue(intClass, self.length)
  })
  // TODO: return option value
  .addPrimitive("at:", (self: string, [arg]) => {
    const index = intValue(arg)
    const ch = self[index] || ""
    return new PrimitiveValue(stringClass, ch)
  })
  // TODO: return option value
  .addPrimitive("code at:", (self: string, [arg]) => {
    const index = intValue(arg)
    const code = index < self.length ? self.charCodeAt(index) : -1
    return new PrimitiveValue(intClass, code)
  })
  .addPrimitive("from:to:", (self, [from, to]) => {
    return new PrimitiveValue(
      stringClass,
      self.slice(intValue(from), intValue(to))
    )
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .addPrimitive("hash", (self) => {
    // FIXME
    const hash = (self.length << 8) + self.charCodeAt(0)
    return new PrimitiveValue(intClass, hash)
  })
  .build()

export function intValue(arg: Value): number {
  if (arg.instanceof(intClass)) {
    return arg.primitiveValue
  }
  throw new PrimitiveTypeError("Integer")
}

function numeric(
  self: number,
  arg: Value,
  fn: (a: number, b: number) => number
): Value {
  if (arg.instanceof(intClass)) {
    return new PrimitiveValue(intClass, fn(self, arg.primitiveValue))
  } else if (arg.instanceof(floatClass)) {
    return new PrimitiveValue(floatClass, fn(self, arg.primitiveValue))
  } else {
    throw new PrimitiveTypeError("Numeric")
  }
}

function numericCompare(
  self: number,
  arg: Value,
  fn: (a: number, b: number) => boolean
): Value {
  if (arg.instanceof(intClass) || arg.instanceof(floatClass)) {
    return new PrimitiveValue(boolClass, fn(self, arg.primitiveValue))
  } else {
    throw new PrimitiveTypeError("Numeric")
  }
}

export const intClass: IRClass = new IRClassBuilder()
  .addPrimitive("+:", (self, [arg]) => {
    return numeric(self, arg, (a, b) => a + b)
  })
  .addPrimitive("-:", (self, [arg]) => {
    return numeric(self, arg, (a, b) => a - b)
  })
  .addPrimitive("*:", (self, [arg]) => {
    return numeric(self, arg, (a, b) => a * b)
  })
  .addPrimitive("&:", (self, [arg]) => {
    return new PrimitiveValue(intClass, self & intValue(arg))
  })
  .addPrimitive("|:", (self, [arg]) => {
    return new PrimitiveValue(intClass, self | intValue(arg))
  })
  .addPrimitive("^:", (self, [arg]) => {
    return new PrimitiveValue(intClass, self ^ intValue(arg))
  })
  .addPrimitive(">>:", (self, [arg]) => {
    return new PrimitiveValue(intClass, self >> intValue(arg))
  })
  .addPrimitive("<<:", (self, [arg]) => {
    return new PrimitiveValue(intClass, self << intValue(arg))
  })
  .addPrimitive("-", (self) => {
    return new PrimitiveValue(intClass, -self)
  })
  .addPrimitive("abs", (self) => {
    return new PrimitiveValue(intClass, Math.abs(self))
  })
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.instanceof(intClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("!=:", (self, [arg]) => {
    if (arg.instanceof(intClass)) {
      return arg.primitiveValue !== self ? trueVal : falseVal
    }
    return trueVal
  })
  .addPrimitive("%:", (self, [arg]) => {
    const argValue = intValue(arg)
    const value = self % argValue
    return new PrimitiveValue(intClass, value < 0 ? value + argValue : value)
  })
  .addPrimitive("order:", (self, [arg], ctx) => {
    const other = intValue(arg)
    const selector = self === other ? "=" : self > other ? ">" : "<"
    return new IRModuleExpr("core")
      .eval(ctx)
      .send(ctx, "Ord", [], null)
      .send(ctx, selector, [], null)
  })
  .addPrimitive("max:", (self, [arg]) => {
    const other = intValue(arg)
    return new PrimitiveValue(intClass, self > other ? self : other)
  })
  .addPrimitive("min:", (self, [arg]) => {
    const other = intValue(arg)
    return new PrimitiveValue(intClass, self < other ? self : other)
  })
  .addPrimitive("max:min:", (self, [max, min]) => {
    const maxInt = intValue(max)
    const minInt = intValue(min)
    return new PrimitiveValue(
      intClass,
      Math.max(minInt, Math.min(self, maxInt))
    )
  })
  .addPrimitive("==:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a === b)
  })
  .addPrimitive("!==:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a !== b)
  })
  .addPrimitive(">=:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a >= b)
  })
  .addPrimitive(">:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a > b)
  })
  .addPrimitive("<=:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a <= b)
  })
  .addPrimitive("<:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a < b)
  })
  .addPrimitive("debug", (self) => {
    return new PrimitiveValue(stringClass, String(self))
  })
  .addPrimitive("to String", (self) => {
    return new PrimitiveValue(stringClass, String(self))
  })
  .addPrimitive("popcount", (n) => {
    n = n - ((n >> 1) & 0x55555555)
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
    n = (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24
    return new PrimitiveValue(intClass, n)
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .addPrimitive("hash", (self) => {
    return new PrimitiveValue(intClass, self)
  })
  .build()

export function floatValue(arg: Value): number {
  if (arg.instanceof(intClass) || arg.instanceof(floatClass)) {
    return arg.primitiveValue
  } else {
    throw new PrimitiveTypeError("Float")
  }
}

export const floatClass: IRClass = new IRClassBuilder()
  .addPrimitive("debug", (self: number) => {
    const str = self === (self | 0) ? `${self}.0` : `${self}`
    return new PrimitiveValue(stringClass, str)
  })
  .addPrimitive("+:", (self, [arg]) => {
    return new PrimitiveValue(floatClass, self + floatValue(arg))
  })
  .addPrimitive("-:", (self, [arg]) => {
    return new PrimitiveValue(floatClass, self - floatValue(arg))
  })
  .addPrimitive("*:", (self, [arg]) => {
    return new PrimitiveValue(floatClass, self * floatValue(arg))
  })
  .addPrimitive("-", (self) => {
    return new PrimitiveValue(floatClass, -self)
  })
  .addPrimitive("abs", (self) => {
    return new PrimitiveValue(floatClass, Math.abs(self))
  })
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (arg.instanceof(floatClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("!=:", (self, [arg], ctx) => {
    if (arg.instanceof(floatClass)) {
      return arg.primitiveValue !== self ? trueVal : falseVal
    }
    return trueVal
  })
  .addPrimitive("==:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a === b)
  })
  .addPrimitive(">=:", (self, [arg], ctx) => {
    return numericCompare(self, arg, (a, b) => a >= b)
  })
  .build()

const cellInstance = new IRClassBuilder()
  .addPrimitive("debug", (self: { value: Value }, _, ctx) => {
    const str = self.value.send(
      ctx,
      "debug",
      [],
      new PrimitiveValue(stringClass, "<unknown>")
    ).primitiveValue
    return new PrimitiveValue(stringClass, `Cell{:${str}}`)
  })
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
  .addPrimitive("reverse", (self) => {
    self.reverse()
    return new PrimitiveValue(arrayInstance, self)
  })
  .addPrimitive("sort by:", (self: any[], [f], ctx) => {
    self.sort(
      (left, right) =>
        f
          .send(
            ctx,
            "left:right:",
            [new IRValueArg(left), new IRValueArg(right)],
            null
          )
          .send(ctx, "to JS", [], null).primitiveValue
    )

    return new PrimitiveValue(arrayInstance, self)
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
    .addPrimitive("panics:", (_, [arg], ctx) => {
      assert.throws(() => {
        arg.send(ctx, "", [], null)
      })
      return unit
    })
    .build(),
  []
)

const panicModule = new ObjectValue(
  new IRClassBuilder()
    .addPrimitive(":", (_, [message]) => {
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
  .addPrimitive("~", (self) => {
    return new PrimitiveValue(bigIntClass, ~self)
  })
  .addPrimitive("&:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self & bigIntValue(arg))
  })
  .addPrimitive("|:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self | bigIntValue(arg))
  })
  .addPrimitive("^:", (self, [arg]) => {
    return new PrimitiveValue(bigIntClass, self ^ bigIntValue(arg))
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

export const nativeModule = new ObjectValue(
  new IRClassBuilder()
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
    .addConst("Debug", debugModule)
    .addConst("BigInt", bigIntModule)
    .build(),
  []
)
