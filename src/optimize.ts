import { IRExpr, Value } from "./interface"
import {
  IRClass,
  IRObjectExpr,
  ObjectValue,
  PrimitiveValue,
} from "./interpreter"

export function constObject(cls: IRClass, ivars: IRExpr[]): IRExpr {
  const constIvars: Value[] = []
  for (const ivar of ivars) {
    if (ivar instanceof PrimitiveValue || ivar instanceof ObjectValue) {
      constIvars.push(ivar)
    } else {
      return new IRObjectExpr(cls, ivars)
    }
  }
  return new ObjectValue(cls, constIvars)
}
