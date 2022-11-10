import {
  IRExpr,
  IRStmt,
  IRArg,
  Value,
  NoMethodError,
  NoProviderError,
  IRMethod,
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
    /* istanbul ignore next */
    if (this.self.tag !== "object") {
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
  createChild(self: Value, args: Value[]): Interpreter {
    return new Interpreter(self, args, this.provideScope)
  }
}

function argValues(ctx: Interpreter, args: IRArg[]): Value[] {
  return args.map((arg) => {
    switch (arg.tag) {
      case "value":
        return expr(ctx, arg.value)
      case "var":
        return ctx.getLocal(arg.index)
      case "block":
        return { tag: "block", class: arg.class, ctx }
    }
  })
}

function call(
  parent: Interpreter,
  selector: string,
  target: Value,
  inArgs: IRArg[]
): Value {
  if (target.tag === "block") {
    const ctx = target.ctx as any
    const method = target.class.methods.get(selector)
    if (!method) {
      if (target.class.elseHandler) {
        return body(ctx, target.class.elseHandler)
      }
      throw new NoMethodError(selector)
    }

    const args = argValues(parent, inArgs)
    args.forEach((arg, i) => ctx.setLocal(method.offset + i, arg))
    const result = body(ctx, method.body)

    inArgs.forEach((arg, i) => {
      if (arg.tag === "var") {
        const result = ctx.getLocal(method.offset + i)
        parent.setLocal(arg.index, result)
      }
    })

    return result
  }

  const method = target.class.methods.get(selector)
  if (!method) {
    if (target.class.elseHandler) {
      const ctx = parent.createChild(target, [])
      return body(ctx, target.class.elseHandler)
    }
    throw new NoMethodError(selector)
  }

  const primitiveValue = target.tag === "primitive" ? target.value : null
  const args = argValues(parent, inArgs)

  switch (method.tag) {
    case "primitive":
      return method.fn(primitiveValue, args)

    case "object":
      const ctx = parent.createChild(target, args)
      const result = Return.handleReturn(ctx, () => body(ctx, method.body))

      for (const [index, arg] of inArgs.entries()) {
        if (arg.tag === "var") {
          const result = ctx.getLocal(index)
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

class Return {
  constructor(private ctx: object, private value: Value) {}
  static handleReturn(ctx: object, fn: () => Value): Value {
    try {
      return fn()
    } catch (e) {
      if (e instanceof Return && e.ctx === ctx) {
        return e.value
      } else {
        throw e
      }
    }
  }
}

function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result = unit

  for (const stmt of stmts) {
    switch (stmt.tag) {
      case "assign":
        ctx.setLocal(stmt.index, expr(ctx, stmt.value))
        result = unit
        break
      case "return":
        throw new Return(ctx, expr(ctx, stmt.value))
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
