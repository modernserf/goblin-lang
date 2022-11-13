import assert from "node:assert/strict"
import {
  IRClass,
  Value,
  IRHandler,
  IRStmt,
  IRExpr,
  IRParam,
  unit,
  Interpreter,
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
  .addPrimitive("Assert", () => assertModule)
  .build()
