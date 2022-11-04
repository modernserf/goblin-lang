import { IRExpr, IRStmt, IRClass, PrimitiveClass } from "./compiler-2"

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "primitive"; class: PrimitiveClass; value: any }

const unit: Value = { tag: "object", class: new Map([]), ivars: [] }

class Interpreter {
  constructor(readonly self: Value, private locals: Value[]) {}
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getLocal(index: number): Value {
    return this.locals[index]
  }
  getIvar(index: number): Value {
    if (this.self.tag === "primitive") {
      throw new Error("should be unreachable")
    }
    return this.self.ivars[index]
  }
}

function call(selector: string, target: Value, args: Value[]): Value {
  switch (target.tag) {
    case "primitive": {
      const method = target.class.get(selector)
      if (!method) throw new Error(`No method with selector ${selector}`)
      return method(target.value, args)
    }
    case "object": {
      const method = target.class.get(selector)
      if (!method) throw new Error(`No method with selector ${selector}`)
      const ctx = new Interpreter(target, args)
      return body(ctx, method)
    }
  }
}

function expr(ctx: Interpreter, value: IRExpr): Value {
  switch (value.tag) {
    case "self":
      return ctx.self
    case "primitive":
      return value
    case "ivar":
      return ctx.getIvar(value.index)
    case "local":
      return ctx.getLocal(value.index)
    case "object":
      return {
        tag: "object",
        class: value.class,
        ivars: value.ivars.map((ivar) => expr(ctx, ivar)),
      }
    case "call":
      return call(
        value.selector,
        expr(ctx, value.target),
        value.args.map((arg) => expr(ctx, arg))
      )
  }
}

function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result = unit

  for (const stmt of stmts) {
    switch (stmt.tag) {
      case "let":
        ctx.setLocal(stmt.index, expr(ctx, stmt.value))
        result = unit
      case "return":
        return expr(ctx, stmt.value)
      case "expr":
        result = expr(ctx, stmt.value)
    }
  }
  return result
}

export function program(stmts: IRStmt[]): Value {
  const ctx = new Interpreter(unit, [])
  return body(ctx, stmts)
}
