import {
  IRClass,
  IRConstantExpr,
  IRExpr,
  IRObjectExpr,
  Value,
} from "./interpreter"

export function constObject(cls: IRClass, ivars: IRExpr[]): IRExpr {
  const constIvars: Value[] = []
  for (const ivar of ivars) {
    if (ivar instanceof IRConstantExpr) {
      constIvars.push(ivar.value)
    } else {
      return new IRObjectExpr(cls, ivars)
    }
  }
  return new IRConstantExpr({ tag: "object", class: cls, ivars: constIvars })
}
