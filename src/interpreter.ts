import {
  IRExpr,
  IRStmt,
  IRArg,
  Value,
  NoMethodError,
  NoProviderError,
} from "./ir"
import { unit } from "./stdlib"

class Interpreter {
  static root(): Interpreter {
    return new Interpreter(unit, [], new Map())
  }
  constructor(
    readonly self: Value,
    private locals: Value[],
    private provideScope: Map<string, Value>
  ) {}
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getLocal(index: number): Value {
    return this.locals[index]
  }
  getIvar(index: number): Value {
    if (this.self.tag === "primitive") {
      throw new Error("getIvar should be unreachable")
    }
    return this.self.ivars[index]
  }
  use(key: string): Value {
    const res = this.provideScope.get(key)
    if (!res) throw new NoProviderError(key)
    return res
  }
  provide(key: string, value: Value) {
    const next = new Map(this.provideScope)
    next.set(key, value)
    this.provideScope = next
  }
  createChild(self: Value, args: IRArg[]) {
    return new Interpreter(self, argValues(this, args), this.provideScope)
  }
}

function argValues(ctx: Interpreter, args: IRArg[]): Value[] {
  return args.map((arg) => {
    switch (arg.tag) {
      case "value":
        return expr(ctx, arg.value)
      case "var":
        return ctx.getLocal(arg.index)
    }
  })
}

function call(
  parent: Interpreter,
  selector: string,
  target: Value,
  args: IRArg[]
): Value {
  const method = target.class.methods.get(selector)
  if (!method) throw new NoMethodError(selector)
  const primitiveValue = target.tag === "primitive" ? target.value : null

  switch (method.tag) {
    case "primitive":
      return method.fn(primitiveValue, argValues(parent, args))
    case "object":
      const ctx = parent.createChild(target, args)
      const result = body(ctx, method.body)
      for (const effect of method.effects) {
        switch (effect.tag) {
          case "var":
            const arg = args[effect.argIndex]
            if (arg.tag !== "var") {
              throw new Error("var should be unreachable")
            }

            const result = ctx.getLocal(effect.indexInMethod)
            parent.setLocal(arg.index, result)
        }
      }
      return result
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
      return call(ctx, value.selector, expr(ctx, value.target), value.args)
    case "use":
      return ctx.use(value.key)
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
      case "provide":
        ctx.provide(stmt.key, expr(ctx, stmt.value))
        break
    }
  }
  return result
}

export function program(stmts: IRStmt[]): Value {
  const ctx = Interpreter.root()
  return body(ctx, stmts)
}
