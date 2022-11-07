import {
  PrimitiveMethod,
  PrimitiveClass,
  IRClass,
  Value,
  IRMethod,
  IRExpr,
} from "./ir"

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

const cellInstance: PrimitiveClass = new Map<string, PrimitiveMethod>([
  ["get", (self) => self.value],
  [
    "set:",
    (self, [arg]) => {
      self.value = arg
      return unit
    },
  ],
])

const cellModule: PrimitiveClass = new Map<string, PrimitiveMethod>([
  [
    ":",
    (_, [arg]) => ({
      tag: "primitive",
      class: cellInstance,
      value: { value: arg },
    }),
  ],
])

export const core: IRClass = new Map<string, IRMethod>([
  [
    "Cell",
    {
      effects: [],
      body: [
        {
          tag: "return",
          value: { tag: "primitive", class: cellModule, value: null },
        },
      ],
    },
  ],
])
