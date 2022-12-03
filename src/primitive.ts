import { Interpreter, IRHandler, Value } from "./interface"
import { IRModuleExpr } from "./ir-expr"
import { IRConstHandler, IRPrimitiveHandler } from "./ir-handler"
import { unit, PrimitiveValue, IRClass } from "./value"

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
  .addPrimitive(":", (value, [arg], ctx) => {
    const selector = value ? "true" : "false"
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
  .addPrimitive("++:", (self, [arg]) => {
    return new PrimitiveValue(stringClass, `${self}${strValue(arg)}`)
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
  .addPrimitive("code at:", (self, [arg]) => {
    const index = intValue(arg)
    const code = index < self.length ? self.charCodeAt(index) : -1
    return new PrimitiveValue(intClass, code)
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
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
  .addPrimitive("order:", (self, [arg], ctx) => {
    const other = floatValue(arg)
    const selector = self === other ? "=" : self > other ? ">" : "<"
    return new IRModuleExpr("core")
      .eval(ctx)
      .send(ctx, "Ord", [], null)
      .send(ctx, selector, [], null)
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
  .addPrimitive("to String", (self) => {
    return new PrimitiveValue(stringClass, String(self))
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .build()

export function floatValue(arg: Value): number {
  if (arg.instanceof(intClass) || arg.instanceof(floatClass)) {
    return arg.primitiveValue
  } else {
    throw new PrimitiveTypeError("Float")
  }
}

export const floatClass: IRClass = new IRClassBuilder()
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
