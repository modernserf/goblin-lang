import { Interpreter, IRExpr, IRStmt, Value } from "./interface"
import { unit } from "./value"

export class Return {
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

export class IRAssignStmt implements IRStmt {
  constructor(private index: number, private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    ctx.setLocal(this.index, this.value.eval(ctx))
  }
}

export class IRReturnStmt implements IRStmt {
  constructor(private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    throw new Return(ctx, this.value.eval(ctx))
  }
}

export class IRProvideStmt implements IRStmt {
  constructor(private key: string, private value: IRExpr) {}
  eval(ctx: Interpreter): void | Value {
    ctx.provide(this.key, this.value.eval(ctx))
  }
}

export class IRDeferStmt implements IRStmt {
  constructor(private body: IRStmt[]) {}
  eval(ctx: Interpreter): void | Value {
    ctx.defer(this.body)
  }
}

export function body(ctx: Interpreter, stmts: IRStmt[]): Value {
  let result: Value = unit
  try {
    for (const stmt of stmts) {
      result = stmt.eval(ctx) || unit
    }
    return result
  } finally {
    ctx.resolveDefers()
  }
}
