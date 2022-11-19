import { IRExpr, Value } from "./interface"
import { IRClass, IRObjectExpr, ObjectValue } from "./interpreter"

export function constObject(cls: IRClass, ivars: IRExpr[]): IRExpr {
  const constIvars: Value[] = []
  for (const ivar of ivars) {
    const value = ivar.const?.()
    if (value) {
      constIvars.push(value)
    } else {
      return new IRObjectExpr(cls, ivars)
    }
  }
  return new ObjectValue(cls, constIvars)
}
