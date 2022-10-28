import { Expr } from "./parser"

export type Value =
  | { tag: "string"; value: string; cluster: Cluster }
  | { tag: "number"; value: number; cluster: Cluster }
  | { tag: "object"; fields: Record<string, Value>; cluster: Cluster }

export function toJS(value: Value): unknown {
  switch (value.tag) {
    case "string":
    case "number":
      return value.value
    default:
      throw new Error("not yet implemented")
  }
}

type Cluster = Record<string, (...xs: Value[]) => Value>

const NumberCluster: Cluster = {}
type StringVal = Value & { tag: "string" }
const StringCluster: Cluster = {
  "to upper case": (receiver) => ({
    tag: "string",
    value: (receiver as StringVal).value.toUpperCase(),
    cluster: StringCluster,
  }),
}

export class Interpreter {
  expr(expr: Expr): Value {
    switch (expr.tag) {
      case "number":
        return { tag: "number", value: expr.value, cluster: NumberCluster }
      case "string":
        return { tag: "string", value: expr.value, cluster: StringCluster }
      case "callTag": {
        const receiver = this.expr(expr.receiver)
        return receiver.cluster[expr.value](receiver)
      }

      default:
        throw new Error("not yet implemented")
    }
  }
}
