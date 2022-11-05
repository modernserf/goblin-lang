import { IRExpr, IRStmt, IRClass, PrimitiveClass, IRArg } from "./compiler"

export type Value =
  | { tag: "object"; class: IRClass; ivars: Value[] }
  | { tag: "primitive"; class: PrimitiveClass; value: any }

type CallArg =
  | { tag: "value"; value: Value } //
  | { tag: "var"; index: number }

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

function argValues(ctx: Interpreter, args: CallArg[]): Value[] {
  return args.map((arg) => {
    switch (arg.tag) {
      case "value":
        return arg.value
      case "var":
        return ctx.getLocal(arg.index)
    }
  })
}

function call(
  parent: Interpreter,
  selector: string,
  target: Value,
  args: CallArg[]
): Value {
  switch (target.tag) {
    case "primitive": {
      const method = target.class.get(selector)
      if (!method) throw new Error(`No method with selector ${selector}`)
      return method(target.value, argValues(parent, args))
    }
    case "object": {
      const method = target.class.get(selector)
      if (!method) throw new Error(`No method with selector ${selector}`)
      const ctx = new Interpreter(target, argValues(parent, args))
      const result = body(ctx, method.body)
      for (const effect of method.effects) {
        switch (effect.tag) {
          case "var":
            const arg = args[effect.argIndex]
            if (arg.tag !== "var") throw new Error("should be unreachable")
            const result = ctx.getLocal(effect.indexInMethod)
            parent.setLocal(arg.index, result)
        }
      }
      return result
    }
  }
}

function arg(ctx: Interpreter, value: IRArg): CallArg {
  switch (value.tag) {
    case "value":
      return { tag: "value", value: expr(ctx, value.value) }
    case "var":
      return { tag: "var", index: value.index }
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
        ctx,
        value.selector,
        expr(ctx, value.target),
        value.args.map((x) => arg(ctx, x))
      )
    default:
      throw new Error(value)
  }
}

// TODO: non-local returns will complicate this
function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result = unit

  for (const stmt of stmts) {
    switch (stmt.tag) {
      case "assign":
        ctx.setLocal(stmt.index, expr(ctx, stmt.value))
        result = unit
        break
      case "return":
        return expr(ctx, stmt.value)
      case "expr":
        result = expr(ctx, stmt.value)
        break
    }
  }
  return result
}

export function program(stmts: IRStmt[]): Value {
  const ctx = new Interpreter(unit, [])
  return body(ctx, stmts)
}
