import { PrimitiveMethod, PrimitiveClass, Value } from "./ir"

export const unit: Value = { tag: "object", class: new Map([]), ivars: [] }

export const stringClass: PrimitiveClass = new Map<string, PrimitiveMethod>([])
export const intClass: PrimitiveClass = new Map<string, PrimitiveMethod>([
  [
    "+:",
    (self, args) => {
      const arg = args[0]
      if (arg.tag !== "primitive" || arg.class !== intClass) {
        throw new Error("Expected integer")
      }
      return { tag: "primitive", class: intClass, value: self + arg.value }
    },
  ],
  [
    "js debug",
    (self, _) => {
      console.log("DEBUG:", self)
      return unit
    },
  ],
])
