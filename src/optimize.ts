import { IRClass, IRExpr, Value } from "./interpreter"

export function constObject(cls: IRClass, ivars: IRExpr[]): IRExpr {
  const constIvars: Value[] = []
  for (const ivar of ivars) {
    if (ivar.tag === "constant") {
      constIvars.push(ivar.value)
    } else {
      return { tag: "object", class: cls, ivars: ivars }
    }
  }
  return {
    tag: "constant",
    value: { tag: "object", class: cls, ivars: constIvars },
  }
}
