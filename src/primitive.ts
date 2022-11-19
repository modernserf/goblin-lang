import { Value } from "./interface"
import { unit, PrimitiveValue } from "./value"
import { IRClassBuilder as IRClass } from "./ir"

export class PrimitiveTypeError {
  constructor(readonly expected: string) {}
}

export function boolValue(arg: Value): boolean {
  if (arg.instanceof(boolClass)) {
    return arg.primitiveValue
  }
  throw new PrimitiveTypeError("Bool")
}

export const boolClass: IRClass = new IRClass()
  .addPrimitive(":", (value, [arg], ctx) => {
    const selector = value ? "true" : "false"
    return arg.send(ctx, selector, [])
  })
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.instanceof(boolClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
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

export const trueVal = new PrimitiveValue(boolClass, true)
export const falseVal = new PrimitiveValue(boolClass, false)

export function strValue(arg: Value): string {
  if (arg.instanceof(stringClass)) {
    return arg.primitiveValue
  }
  throw new PrimitiveTypeError("String")
}

export const stringClass: IRClass = new IRClass()
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.instanceof(stringClass)) {
      return arg.primitiveValue === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("++:", (self, [arg]) => {
    return new PrimitiveValue(stringClass, `${self}${strValue(arg)}`)
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )

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

export const intClass: IRClass = new IRClass()
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
  .addPrimitive("==:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a === b)
  })
  .addPrimitive(">=:", (self, [arg], ctx) => {
    return numericCompare(self, arg, (a, b) => a >= b)
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )

export function floatValue(arg: Value): number {
  if (arg.instanceof(intClass) || arg.instanceof(floatClass)) {
    return arg.primitiveValue
  } else {
    throw new PrimitiveTypeError("Float")
  }
}

export const floatClass: IRClass = new IRClass()
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
  .addPrimitive("==:", (self, [arg]) => {
    return numericCompare(self, arg, (a, b) => a === b)
  })
  .addPrimitive(">=:", (self, [arg], ctx) => {
    return numericCompare(self, arg, (a, b) => a >= b)
  })
