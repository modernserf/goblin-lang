import {
  IRClass,
  Value,
  IRHandler,
  PrimitiveTypeError,
  IRExpr,
  unit,
  Interpreter,
  send,
  IRParam,
  IRStmt,
} from "./interpreter"

export class IRClassBuilder {
  private methods = new Map<string, IRHandler>()
  addPrimitive(
    key: string,
    fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ): this {
    /* istanbul ignore next */
    if (this.methods.has(key)) throw new Error("duplicate method")
    this.methods.set(key, { tag: "primitive", fn })
    return this
  }
  build(): IRClass {
    return { handlers: this.methods, else: null }
  }
}

// locals (including method args)
const $0: IRExpr = { tag: "local", index: 0 }

export function boolValue(arg: Value): boolean {
  if (arg.tag !== "primitive" || arg.class !== boolClass) {
    throw new PrimitiveTypeError("string")
  }
  return arg.value
}

export const boolClass: IRClass = new IRClassBuilder()
  .addPrimitive(":", (value, [arg], ctx) => {
    const selector = value ? "true" : "false"
    return send(ctx, selector, arg, [])
  })
  .addPrimitive("=:", (self, [arg]) => {
    if (arg.tag === "primitive" && arg.class === boolClass) {
      return arg.value === self ? trueVal : falseVal
    }
    return falseVal
  })
  .build()

export const trueVal: Value = {
  tag: "primitive",
  value: true,
  class: boolClass,
}
export const falseVal: Value = {
  tag: "primitive",
  value: false,
  class: boolClass,
}

export function strValue(arg: Value): string {
  if (arg.tag !== "primitive" || arg.class !== stringClass) {
    throw new PrimitiveTypeError("string")
  }
  return arg.value
}

export const stringClass: IRClass = new IRClassBuilder()
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (arg.tag === "primitive" && arg.class === stringClass) {
      return arg.value === self ? trueVal : falseVal
    }
    return falseVal
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
  if (arg.tag !== "primitive" || arg.class !== intClass) {
    throw new PrimitiveTypeError("integer")
  }
  return arg.value
}

// TODO: float conversion where appropriate
export const intClass: IRClass = new IRClassBuilder()
  .addPrimitive("+:", (self, [arg]) => {
    return { tag: "primitive", class: intClass, value: self + intValue(arg) }
  })
  .addPrimitive("-:", (self, [arg]) => {
    return { tag: "primitive", class: intClass, value: self - intValue(arg) }
  })
  .addPrimitive("*:", (self, [arg]) => {
    return { tag: "primitive", class: intClass, value: self * intValue(arg) }
  })
  .addPrimitive("&:", (self, [arg]) => {
    return { tag: "primitive", class: intClass, value: self & intValue(arg) }
  })
  .addPrimitive("-", (self) => {
    return { tag: "primitive", class: intClass, value: -self }
  })
  .addPrimitive("abs", (self) => {
    return { tag: "primitive", class: intClass, value: Math.abs(self) }
  })
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (arg.tag === "primitive" && arg.class === intClass) {
      return arg.value === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive(">=:", (self, [arg], ctx) => {
    return self >= intValue(arg) ? trueVal : falseVal
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .build()

// TODO: implicit conversions of ints to floats
export function floatValue(arg: Value): number {
  if (arg.tag !== "primitive" || arg.class !== floatClass) {
    throw new PrimitiveTypeError("float")
  }
  return arg.value
}

export const floatClass: IRClass = new IRClassBuilder()
  .addPrimitive("+:", (self, [arg]) => {
    return {
      tag: "primitive",
      class: floatClass,
      value: self + floatValue(arg),
    }
  })
  .addPrimitive("-:", (self, [arg]) => {
    return {
      tag: "primitive",
      class: floatClass,
      value: self - floatValue(arg),
    }
  })
  .addPrimitive("*:", (self, [arg]) => {
    return {
      tag: "primitive",
      class: floatClass,
      value: self * floatValue(arg),
    }
  })
  .addPrimitive("-", (self) => {
    return { tag: "primitive", class: floatClass, value: -self }
  })
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (arg.tag === "primitive" && arg.class === floatClass) {
      return arg.value === self ? trueVal : falseVal
    }
    return falseVal
  })
  .addPrimitive("abs", (self) => {
    return { tag: "primitive", class: floatClass, value: Math.abs(self) }
  })
  .build()
