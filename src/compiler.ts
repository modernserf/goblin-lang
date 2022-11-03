import { Binding, Expr, Statement } from "./parser-2"

export type Method = { tag: "eval"; body: IRStmt[] }

export type IRClass = Map<string, Method>

// TODO: unit expression in AST
export const unit: IRExpr = {
  tag: "object",
  class: new Map(),
  instance: [],
}

export type IRExpr =
  | { tag: "self" }
  | { tag: "local"; index: number }
  | { tag: "instance"; index: number }
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "object"; class: IRClass; instance: IRExpr[] }
  | { tag: "call"; target: IRExpr; selector: string; arguments: IRExpr[] }

export type IRStmt =
  | { tag: "let"; index: number; expr: IRExpr }
  | { tag: "expr"; expr: IRExpr }
  | { tag: "return"; expr: IRExpr }

type ScopeCheck =
  | { tag: "local"; index: number }
  | { tag: "instance"; index: number }
  | { tag: "self" }

class IndexMap {
  private scope = new Map<string, number>()
  private index = 0
  add(key: string): number {
    if (this.scope.has(key)) {
      throw new Error("duplicate key")
    }
    this.scope.set(key, this.index)
    return this.index++
  }
  has(key: string) {
    return this.scope.has(key)
  }
  get(key: string): number {
    const res = this.scope.get(key)
    if (res === undefined) throw new Error("not found")
    return res
  }
  [Symbol.iterator]() {
    return this.scope.entries()
  }
}

class Scope {
  private locals = new IndexMap()
  constructor(
    private parent: Scope | null = null,
    private sharedInstance = new IndexMap()
  ) {}
  add(key: string): number {
    return this.locals.add(key)
  }
  check(key: string): ScopeCheck {
    if (this.locals.has(key)) {
      return { tag: "local", index: this.locals.get(key) }
    }
    if (this.sharedInstance.has(key)) {
      return { tag: "instance", index: this.sharedInstance.get(key) }
    }
    if (key === "self") {
      return { tag: "self" }
    }
    if (this.parent) {
      this.parent.check(key)
      return { tag: "instance", index: this.sharedInstance.add(key) }
    }
    throw new Error("not found")
  }
}

export class Compiler {
  private scope = new Scope()
  private inScope<T>(instanceVarsMut: IndexMap, fn: () => T) {
    const outerScope = this.scope
    this.scope = new Scope(outerScope, instanceVarsMut)
    try {
      return fn()
    } finally {
      this.scope = outerScope
    }
  }
  program(program: Statement[]): IRStmt[] {
    return program.map((stmt) => this.statement(stmt))
  }
  statement(stmt: Statement): IRStmt {
    switch (stmt.tag) {
      case "let": {
        switch (stmt.binding.tag) {
          case "identifier": {
            const index = this.scope.add(stmt.binding.value)
            return { tag: "let", index, expr: this.expr(stmt.expr) }
          }
          default:
            throw stmt.binding
        }
      }
      case "return":
        return { tag: "return", expr: this.expr(stmt.expr) }
      case "expr":
        return { tag: "expr", expr: this.expr(stmt.expr) }
    }
  }

  expr(expr: Expr): IRExpr {
    switch (expr.tag) {
      case "number":
        return { tag: "integer", value: expr.value }
      case "string":
        return { tag: "string", value: expr.value }
      case "identifier":
        return this.identifier(expr.value)
      case "call": {
        const target = this.expr(expr.target)
        const args: IRExpr[] = []
        const selector = expr.message
          .map((field) => {
            switch (field.tag) {
              case "key":
                return field.key
              case "pair":
                args.push(this.expr(field.argument))
                return `${field.key}:`
            }
          })
          .join("")
        return { tag: "call", target, selector, arguments: args }
      }
      case "object": {
        const irClass: IRClass = new Map()
        const instanceVarsMut = new IndexMap()
        for (const field of expr.fields) {
          switch (field.tag) {
            case "key":
            case "pair":
              throw new Error("todo frames")
            case "method": {
              let selector = ""
              const params: Binding[] = []
              for (const param of field.params) {
                switch (param.tag) {
                  case "key":
                    selector += param.key
                    break
                  case "pair":
                    selector += `${param.key}:`
                    params.push(param.binding)
                    break
                }
              }

              irClass.set(
                selector,
                this.method(params, field.body, instanceVarsMut)
              )
            }
            default:
              throw field
          }
        }
        const instance: IRExpr[] = []
        for (const [key, index] of instanceVarsMut) {
          instance[index] = this.identifier(key)
        }
        return { tag: "object", class: irClass, instance }
      }
    }
  }
  identifier(key: string): IRExpr {
    const result = this.scope.check(key)
    switch (result.tag) {
      case "local":
        return { tag: "local", index: result.index }
      case "instance":
        return { tag: "instance", index: result.index }
      case "self":
        return { tag: "self" }
    }
  }
  method(
    params: Binding[],
    body: Statement[],
    instanceVarsMut: IndexMap
  ): Method {
    return this.inScope(instanceVarsMut, () => {
      for (const p of params) {
        switch (p.tag) {
          case "identifier":
            this.scope.add(p.value)
            break
        }
      }
      return {
        tag: "eval",
        body: body.map((stmt) => this.statement(stmt)),
      }
    })
  }
}
