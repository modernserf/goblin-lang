import {
  IRExpr,
  IRStmt,
  IRArg,
  Value,
  NoMethodError,
  NoProviderError,
  IRParam,
} from "./ir"
import { unit } from "./stdlib"

class Interpreter {
  static root(): Interpreter {
    return new Interpreter(unit, new Map())
  }
  private locals: Value[] = []
  constructor(readonly self: Value, private provideScope: Map<string, Value>) {}
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getLocal(index: number): Value {
    const result = this.locals[index]
    /* istanbul ignore next */
    if (!result) {
      throw new Error(`missing local ${index}`)
    }
    return result
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
  createChild(self: Value): Interpreter {
    return new Interpreter(self, this.provideScope)
  }
}

export class ArgMismatchError {
  constructor(readonly paramType: string, readonly argType: string) {}
}

function loadArgs(
  caller: Interpreter,
  target: Interpreter,
  offset: number,
  params: IRParam[],
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    const param = params[i]
    /* istanbul ignore next */
    if (!param) throw new Error("missing param")
    switch (arg.tag) {
      case "value": {
        if (param.tag === "var") throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, expr(caller, arg.value))
        return
      }
      case "var": {
        if (param.tag !== "var") throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, caller.getLocal(arg.index))
        return
      }
      case "block": {
        if (param.tag !== "block")
          throw new ArgMismatchError(param.tag, arg.tag)
        target.setLocal(offset + i, {
          tag: "block",
          class: arg.class,
          ctx: caller,
        })
        return
      }
    }
  })
}

function unloadArgs(
  caller: Interpreter,
  target: Interpreter,
  offset: number,
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    if (arg.tag === "var") {
      const result = target.getLocal(offset + i)
      caller.setLocal(arg.index, result)
    }
  })
}

function call(
  caller: Interpreter,
  selector: string,
  target: Value,
  args: IRArg[]
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

    loadArgs(caller, ctx, method.offset, method.params, args)
    const result = body(ctx, method.body)
    unloadArgs(caller, ctx, method.offset, args)
    return result
  }

  const method = target.class.methods.get(selector)
  if (!method) {
    if (target.class.elseHandler) {
      const ctx = caller.createChild(target)
      return body(ctx, target.class.elseHandler)
    }
    throw new NoMethodError(selector)
  }

  switch (method.tag) {
    case "primitive": {
      const targetValue = target.tag === "primitive" ? target.value : null
      const argValues = args.map((arg) => {
        /* istanbul ignore next */
        if (arg.tag !== "value") throw "invalid arg"
        return expr(caller, arg.value)
      })
      return method.fn(targetValue, argValues)
    }
    case "object":
      const child = caller.createChild(target)
      loadArgs(caller, child, 0, method.params, args)
      const result = Return.handleReturn(child, () => body(child, method.body))
      unloadArgs(caller, child, 0, args)
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
