import assert from "node:assert/strict"
import {
  IRClass,
  Value,
  IRHandler,
  PrimitiveTypeError,
  IRStmt,
  IRExpr,
  IRParam,
  unit,
} from "./interpreter"

class IRClassBuilder {
  private methods = new Map<string, IRHandler>()
  addPrimitive(key: string, fn: (value: any, args: Value[]) => Value): this {
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
const $1: IRExpr = { tag: "local", index: 1 }
const $2: IRExpr = { tag: "local", index: 2 }

// ivars (including parent class)
const _0: IRExpr = { tag: "ivar", index: 0 }

const selfRef = (index: number): IRStmt => ({
  tag: "assign",
  index,
  value: { tag: "self" },
})

/*
let Bool := [
	on {!} [
    on {!} Bool
		on {true} Bool{false}
		on {false} Bool{true}
	]
	on {true} [
    on {!} Bool{false}
		on {: block match} match{true}
		on {=: other} other{: Bool} # {true} => true, {false} => false
	]
	on {false} [
    on {!} Bool{true}
		on {: block match} match{false}
		on {=: other} other{: !Bool} # {true} => false, {false} => true
	]
]
*/

const notClass: IRClass = new IRClassBuilder()
  .addIR("!", [], [{ tag: "expr", value: _0 }])
  .addIR(
    "true",
    [],
    [
      {
        tag: "expr",
        value: { tag: "send", target: _0, selector: "false", args: [] },
      },
    ]
  )
  .addIR(
    "false",
    [],
    [
      {
        tag: "expr",
        value: { tag: "send", target: _0, selector: "true", args: [] },
      },
    ]
  )
  .build()

const trueClass: IRClass = new IRClassBuilder()
  .addIR(
    "!",
    [],
    [
      {
        tag: "expr",
        value: { tag: "send", selector: "false", target: _0, args: [] },
      },
    ]
  )
  .addIR(
    ":",
    [{ tag: "do" }],
    [
      {
        tag: "expr",
        value: { tag: "send", target: $0, selector: "true", args: [] },
      },
    ]
  )
  .addIR(
    "=:",
    [{ tag: "value" }],
    [
      {
        tag: "expr",
        value: {
          tag: "send",
          target: $0,
          selector: ":",
          args: [{ tag: "value", value: _0 }],
        },
      },
    ]
  )
  .build()

const falseClass: IRClass = new IRClassBuilder()
  .addIR(
    "!",
    [],
    [
      {
        tag: "expr",
        value: { tag: "send", selector: "true", target: _0, args: [] },
      },
    ]
  )
  .addIR(
    ":",
    [{ tag: "do" }],
    [
      {
        tag: "expr",
        value: { tag: "send", target: $0, selector: "false", args: [] },
      },
    ]
  )
  .addIR(
    "=:",
    [{ tag: "value" }],
    [
      {
        tag: "expr",
        value: {
          tag: "send",
          target: $0,
          selector: ":",
          args: [
            {
              tag: "value",
              value: { tag: "send", selector: "!", args: [], target: _0 },
            },
          ],
        },
      },
    ]
  )
  .build()

const boolClass: IRClass = new IRClassBuilder()
  .addIR(
    "!",
    [],
    [
      selfRef(0),
      { tag: "expr", value: { tag: "object", class: notClass, ivars: [$0] } },
    ]
  )
  .addIR(
    "true",
    [],
    [
      selfRef(0),
      { tag: "expr", value: { tag: "object", class: trueClass, ivars: [$0] } },
    ]
  )
  .addIR(
    "false",
    [],
    [
      selfRef(0),
      { tag: "expr", value: { tag: "object", class: falseClass, ivars: [$0] } },
    ]
  )
  .build()

const boolModule: Value = { tag: "object", class: boolClass, ivars: [] }
const trueValue: Value = {
  tag: "object",
  class: trueClass,
  ivars: [boolModule],
}
const falseValue: Value = {
  tag: "object",
  class: falseClass,
  ivars: [boolModule],
}

function strValue(arg: Value): string {
  if (arg.tag !== "primitive" || arg.class !== stringClass) {
    throw new PrimitiveTypeError("string")
  }
  return arg.value
}

export const stringClass = new IRClassBuilder()
  .addPrimitive("=:", (self, [arg]) => {
    if (self === strValue(arg)) {
      return trueValue
    } else {
      return falseValue
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
  .addPrimitive("=:", (self, [arg]) => {
    if (self === intValue(arg)) {
      return trueValue
    } else {
      return falseValue
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

const cellInstance = new IRClassBuilder()
  .addPrimitive("get", (self) => self.value)
  .addPrimitive("set:", (self, [arg]) => {
    self.value = arg
    return unit
  })
  .addIR(
    "update:",
    [{ tag: "do" }],
    [
      {
        tag: "expr",
        value: {
          tag: "send",
          target: { tag: "self" },
          selector: "set:",
          args: [
            {
              tag: "value",
              value: {
                tag: "send",
                target: $0,
                selector: ":",
                args: [
                  {
                    tag: "value",
                    value: {
                      tag: "send",
                      target: { tag: "self" },
                      selector: "get",
                      args: [],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ]
  )
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

const assertModule: Value = {
  tag: "object",
  ivars: [],
  class: new IRClassBuilder()
    .addPrimitive("expected:received:", (_, [exp, recv]) => {
      assert.deepEqual(recv, exp)
      return unit
    })
    .build(),
}

export const core = new IRClassBuilder()
  .addPrimitive("Cell", () => cellModule)
  .addPrimitive("Bool", () => boolModule)
  .addPrimitive("Assert", () => assertModule)
  .build()
