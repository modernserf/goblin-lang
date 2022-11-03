import { IRExpr, IRStmt, IRClass } from "./compiler"

export type Value =
  | { tag: "object"; class: IRClass; instance: Value[] }
  | { tag: "primitive"; class: PrimitiveClass; value: any }

export type PrimitiveMethod =
  | {
      tag: "native"
      call: (self: Value & { tag: "primitive" }, args: Value[]) => Value
    }
  | { tag: "eval"; body: IRStmt[] }

type PrimitiveClass = Map<string, PrimitiveMethod>

const intClass: PrimitiveClass = new Map([
  [
    "+:",
    {
      tag: "native",
      call: (self, [other]) => ({
        tag: "primitive" as const,
        class: intClass,
        value: self.value + typedValue(other, intClass),
      }),
    },
  ],
  [
    "-:",
    {
      tag: "native",
      call: (self, [other]) => ({
        tag: "primitive" as const,
        class: intClass,
        value: self.value - typedValue(other, intClass),
      }),
    },
  ],
  [
    "-",
    {
      tag: "native",
      call: (self) => ({
        tag: "primitive" as const,
        class: intClass,
        value: -self.value,
      }),
    },
  ],
])
const stringClass: PrimitiveClass = new Map()

const unit: Value = {
  tag: "object",
  class: new Map(),
  instance: [],
}

function typedValue(value: Value | undefined, theClass: PrimitiveClass): any {
  if (!value || value.tag !== "primitive" || value.class !== theClass) {
    throw new Error("invalid arg")
  }
  return value.value
}

class Context {
  constructor(
    private locals: Value[] = [],
    private self: Value | null = null
  ) {}
  getLocal(index: number): Value {
    return this.locals[index]
  }
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getSelf(): Value {
    if (!this.self) throw new Error("no self value")
    return this.self
  }
  getInstance(index: number): Value {
    if (!this.self || this.self.tag === "primitive") {
      throw new Error("invalid instance var")
    }
    return this.self.instance[index]
  }
}

export class Interpreter {
  private context = new Context()
  body(body: IRStmt[]): Value {
    for (const stmt of body) {
      switch (stmt.tag) {
        case "let":
          this.context.setLocal(stmt.index, this.expr(stmt.expr))
          break
        case "return":
          return this.expr(stmt.expr)
        case "expr":
          this.expr(stmt.expr)
          break
      }
    }
    return unit
  }
  expr(expr: IRExpr): Value {
    switch (expr.tag) {
      case "integer":
        return { tag: "primitive", value: expr.value, class: intClass }
      case "string":
        return { tag: "primitive", value: expr.value, class: stringClass }
      case "object":
        return {
          tag: "object",
          class: expr.class,
          instance: expr.instance.map((value) => this.expr(value)),
        }
      case "self":
        return this.context.getSelf()
      case "local":
        return this.context.getLocal(expr.index)
      case "instance":
        return this.context.getInstance(expr.index)
      case "call": {
        const target = this.expr(expr.target)
        const args = expr.arguments.map((arg) => this.expr(arg))
        const method = target.class.get(expr.selector)
        if (!method) throw new Error("no such method")

        switch (method.tag) {
          case "native":
            if (target.tag !== "primitive") {
              throw new Error("should be unreachable")
            }
            return method.call(target, args)
          case "eval": {
            const oldCtx = this.context
            this.context = new Context(args, target)
            const returnValue = this.body(method.body)
            this.context = oldCtx
            return returnValue
          }
        }
      }
    }
  }
}
