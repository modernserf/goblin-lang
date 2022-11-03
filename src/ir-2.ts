type IRPrimitiveMethod<T> = (target: T, args: Value[]) => Value
class IRPrimitiveClass<T> {
  constructor(private methods: Map<string, IRPrimitiveMethod<T>>) {}
  apply(selector: string, value: T, args: Value[]) {
    const method = this.methods.get(selector)
    if (!method) throw new Error("no such method")
    return method(value, args)
  }
}

export class IRMethod {
  constructor(private block: IRBlock) {}
  apply(target: Value, args: Value[]): Value {
    const ctx = new Context(args, target)
    return this.block.eval(ctx)
  }
}
export class IRClass {
  constructor(private methods: Map<string, IRMethod>) {}
  apply(selector: string, target: Value, args: Value[]): Value {
    const method = this.methods.get(selector)
    if (!method) throw new Error("no such method")
    return method.apply(target, args)
  }
}

class Context {
  constructor(private locals: Value[] = [], public readonly self = unit) {}
  getLocal(index: number): Value {
    return this.locals[index]
  }
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getInstanceVal(index: number): Value {
    return this.self.getInstanceVal(index)
  }
}

interface Value {
  getInstanceVal(index: number): Value
  apply(selector: string, args: Value[]): Value
}
class PrimitiveValue<T> implements Value {
  constructor(private methods: IRPrimitiveClass<T>, private value: any) {}
  getInstanceVal(index: number): Value {
    throw new Error("unreachable")
  }
  apply(selector: string, args: Value[]): Value {
    return this.methods.apply(selector, this.value, args)
  }
}
class ObjectValue implements Value {
  constructor(private methods: IRClass, private instanceVals: Value[]) {}
  getInstanceVal(index: number): Value {
    return this.instanceVals[index]
  }
  apply(selector: string, args: Value[]): Value {
    return this.methods.apply(selector, this, args)
  }
}
const unit: Value = new ObjectValue(new IRClass(new Map()), [])

export interface IRExpr {
  eval(ctx: Context): Value
}

export const IRSelfExpr: IRExpr = {
  eval(ctx) {
    return ctx.self
  },
}

export class IRLocalExpr implements IRExpr {
  constructor(private index: number) {}
  eval(ctx: Context): Value {
    return ctx.getLocal(this.index)
  }
}

export class IRInstanceExpr implements IRExpr {
  constructor(private index: number) {}
  eval(ctx: Context): Value {
    return ctx.getInstanceVal(this.index)
  }
}

const integerMethods = new IRPrimitiveClass(new Map())

export class IRIntegerExpr implements IRExpr {
  constructor(private intValue: number) {}
  value = new PrimitiveValue(integerMethods, this.intValue)
  eval(ctx: Context): Value {
    return this.value
  }
}

const stringMethods = new IRPrimitiveClass(new Map())

export class IRStringExpr implements IRExpr {
  constructor(private stringValue: string) {}
  value = new PrimitiveValue(stringMethods, this.stringValue)
  eval(ctx: Context): Value {
    return this.value
  }
}

export class IRObjectExpr implements IRExpr {
  constructor(private methods: IRClass, private instanceVals: IRExpr[]) {}
  eval(ctx: Context): Value {
    const values = this.instanceVals.map((expr) => expr.eval(ctx))
    return new ObjectValue(this.methods, values)
  }
}

export class IRCallExpr implements IRExpr {
  constructor(
    private target: IRExpr,
    private selector: string,
    private args: IRExpr[]
  ) {}
  eval(ctx: Context): Value {
    const target = this.target.eval(ctx)
    const args = this.args.map((expr) => expr.eval(ctx))
    return target.apply(this.selector, args)
  }
}

export interface IRStmt {
  eval(ctx: Context): IRStmtResult
}

type IRStmtResult = { returnValue?: Value }

export class IRExprStmt implements IRStmt {
  constructor(private expr: IRExpr) {}
  eval(ctx: Context): IRStmtResult {
    this.expr.eval(ctx)
    return {}
  }
}

export class IRReturnStmt implements IRStmt {
  constructor(private expr: IRExpr) {}
  eval(ctx: Context): IRStmtResult {
    return { returnValue: this.expr.eval(ctx) }
  }
}

export class IRLetStmt implements IRStmt {
  constructor(private index: number, private expr: IRExpr) {}
  eval(ctx: Context): IRStmtResult {
    ctx.setLocal(this.index, this.expr.eval(ctx))
    return {}
  }
}

export class IRBlock {
  constructor(private block: IRStmt[]) {}
  eval(ctx: Context): Value {
    for (const stmt of this.block) {
      const { returnValue } = stmt.eval(ctx)
      if (returnValue) return returnValue
    }
    return unit
  }
}
