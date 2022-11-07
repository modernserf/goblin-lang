import { IRClass, Value, IRMethod, PrimitiveTypeError } from "./ir"

class IRClassBuilder {
  private methods = new Map<string, IRMethod>()
  addPrimitive(key: string, fn: (value: any, args: Value[]) => Value): this {
    /* istanbul ignore next */
    if (this.methods.has(key)) throw new Error("duplicate method")
    this.methods.set(key, { tag: "primitive", fn })
    return this
  }
  build(): IRClass {
    return { methods: this.methods }
  }
}

const unitClass = new IRClassBuilder().build()
export const unit: Value = { tag: "object", class: unitClass, ivars: [] }

export const stringClass = new IRClassBuilder().build()

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
  .addPrimitive(
    "js debug",
    /* istanbul ignore next */ (self) => {
      console.log("DEBUG:", self)
      return unit
    }
  )
  .build()

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

export const core = new IRClassBuilder()
  .addPrimitive("Cell", () => cellModule)
  .build()
