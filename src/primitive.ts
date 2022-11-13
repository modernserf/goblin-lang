import {
  IRClass,
  Value,
  IRHandler,
  PrimitiveTypeError,
  IRStmt,
  IRExpr,
  IRParam,
  unit,
  Interpreter,
  getBool,
} from "./interpreter"

class IRClassBuilder {
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
  addIR(key: string, params: IRParam[], body: IRStmt[]): this {
    /* istanbul ignore next */
    if (this.methods.has(key)) throw new Error("duplicate method")
    this.methods.set(key, { tag: "object", body, params })
    return this
  }
  build(): IRClass {
    return { handlers: this.methods, else: null }
  }
}

// locals (including method args)
const $0: IRExpr = { tag: "local", index: 0 }

function strValue(arg: Value): string {
  if (arg.tag !== "primitive" || arg.class !== stringClass) {
    throw new PrimitiveTypeError("string")
  }
  return arg.value
}

export const stringClass = new IRClassBuilder()
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (self === strValue(arg)) {
      return getBool(ctx, "true")
    } else {
      return getBool(ctx, "false")
    }
  })
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .build()

function intValue(arg: Value): number {
  if (arg.tag !== "primitive" || arg.class !== intClass) {
    throw new PrimitiveTypeError("integer")
  }
  return arg.value
}

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
  .addPrimitive("-", (self) => {
    return { tag: "primitive", class: intClass, value: -self }
  })
  .addPrimitive("=:", (self, [arg], ctx) => {
    if (self === intValue(arg)) {
      return getBool(ctx, "true")
    } else {
      return getBool(ctx, "false")
    }
  })
  .addPrimitive("abs", (self) => {
    return { tag: "primitive", class: intClass, value: Math.abs(self) }
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
function floatValue(arg: Value): number {
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
    if (self === floatValue(arg)) {
      return getBool(ctx, "true")
    } else {
      return getBool(ctx, "false")
    }
  })
  .addPrimitive("abs", (self) => {
    return { tag: "primitive", class: floatClass, value: Math.abs(self) }
  })
  .build()
