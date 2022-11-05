export type ASTBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTStruct<ASTParam> }

export type ASTExpr =
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "self" }
  | { tag: "call"; target: ASTExpr; args: ASTStruct<ASTArg> }
  | { tag: "object"; args: ASTStruct<ASTArg> }

export type ASTStmt =
  | { tag: "let"; binding: ASTBinding; value: ASTExpr }
  | { tag: "set"; binding: ASTBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTBinding; value: ASTExpr }
  | { tag: "return"; value: ASTExpr }
  | { tag: "expr"; value: ASTExpr }

export type ASTParam =
  | { tag: "binding"; binding: ASTBinding }
  | { tag: "var"; binding: ASTBinding }

export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTExpr }

// Same shape used for method params, frame fields, method calls,
// though not all combinations are syntactically valid
export type ASTPair<Value> = { key: string; value: Value }
export type ASTMethod = { params: ASTStruct<ASTParam>; body: ASTStmt[] }
export type ASTStruct<Value> =
  | { tag: "key"; selector: string }
  | { tag: "pairs"; selector: string; pairs: ASTPair<Value>[] }
  | { tag: "object"; methods: Map<string, ASTMethod> }

interface StructBuilder<Value extends { tag: string }> {
  key(key: string): StructBuilder<Value>
  pair(key: string, value: Value): StructBuilder<Value>
  method(params: ASTStruct<ASTParam>, body: ASTStmt[]): StructBuilder<Value>
  build(): ASTStruct<Value>
}

export class BaseBuilder<T extends { tag: string }>
  implements StructBuilder<T>
{
  key(key: string): StructBuilder<T> {
    return new KeyBuilder(key)
  }
  pair(key: string, value: T): StructBuilder<T> {
    const next = new PairBuilder<T>()
    return next.pair(key, value)
  }
  method(params: ASTStruct<ASTParam>, body: ASTStmt[]): StructBuilder<T> {
    const next = new ObjectBuilder<T>()
    return next.method(params, body)
  }
  build(): ASTStruct<T> {
    return { tag: "pairs", selector: "", pairs: [] }
  }
}

export class KeyBuilder<T extends { tag: string }> implements StructBuilder<T> {
  constructor(private selector: string) {}
  key(key: string): StructBuilder<T> {
    throw new Error("only one key permitted")
  }
  pair(key: string, value: T): StructBuilder<T> {
    throw new Error("cannot mix keys and pairs")
  }
  method(params: ASTStruct<ASTParam>, body: ASTStmt[]): StructBuilder<T> {
    throw new Error("cannot mix keys and methods")
  }
  build(): ASTStruct<T> {
    return { tag: "key", selector: this.selector }
  }
}

export class PairBuilder<T extends { tag: string }>
  implements StructBuilder<T>
{
  private map = new Map<string, T>()
  key(key: string): StructBuilder<T> {
    throw new Error("cannot mix keys and pairs")
  }
  pair(key: string, value: T): StructBuilder<T> {
    if (this.map.has(key)) throw new Error(`duplicate key "${key}"`)
    this.map.set(key, value)
    return this
  }
  method(params: ASTStruct<ASTParam>, body: ASTStmt[]): StructBuilder<T> {
    throw new Error("cannot mix pairs and methods")
  }
  build(): ASTStruct<T> {
    const pairs = Array.from(this.map.entries()).map(([key, value]) => ({
      key,
      value,
    }))
    pairs.sort((a, b) => a.key.localeCompare(b.key))
    const selector = pairs
      .map(({ key, value }) => {
        if (value.tag === "var") {
          return `${key}(var):`
        }
        return `${key}:`
      })
      .join("")
    return { tag: "pairs", selector, pairs }
  }
}

export class ObjectBuilder<T extends { tag: string }>
  implements StructBuilder<T>
{
  private map = new Map<string, ASTMethod>()
  key(key: string): StructBuilder<T> {
    throw new Error("cannot mix keys and methods")
  }
  pair(key: string, value: T): StructBuilder<T> {
    throw new Error("cannot mix pairs and methods")
  }
  method(params: ASTStruct<ASTParam>, body: ASTStmt[]): StructBuilder<T> {
    if (params.tag === "object") {
      throw new Error("method params must be key or pairs")
    }
    if (this.map.has(params.selector)) {
      throw new Error(`duplicate method ${params.selector}`)
    }
    this.map.set(params.selector, { params, body })
    return this
  }
  build(): ASTStruct<T> {
    return { tag: "object", methods: this.map }
  }
}
