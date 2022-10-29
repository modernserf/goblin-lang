import { Binding, Expr, Statement } from "./parser-2"

export type Method =
  // TODO: should this be left to the interpreter?
  | { tag: "native" }
  // ...
  | { tag: "eval"; params: string[]; body: IRStmt[] }

type IRClass = Map<string, Method>

export type IRExpr =
  | { tag: "unit" }
  | { tag: "local"; binding: string }
  | { tag: "instance"; binding: string }
  | { tag: "primitive"; value: any; class: IRClass }
  | { tag: "object"; class: IRClass; instance: Map<string, IRExpr> }
  | { tag: "call"; target: IRExpr; selector: string; arguments: IRExpr[] }

export type IRStmt =
  | { tag: "let"; binding: string; expr: IRExpr }
  | { tag: "expr"; expr: IRExpr }
  | { tag: "return"; expr: IRExpr }

export const intClass = new Map()
export const stringClass = new Map()

type ScopeCheck = {
  tag: "local" | "instance"
}

class Scope {
  private scope = new Set<string>()
  constructor(
    private parent: Scope | null = null,
    private instanceVarsMut = new Set<string>()
  ) {}
  add(key: string) {
    if (this.scope.has(key)) {
      throw new Error("duplicate key")
    }
    this.scope.add(key)
  }
  check(key: string): ScopeCheck {
    if (this.scope.has(key)) {
      return { tag: "local" }
    }
    if (this.parent) {
      this.parent.check(key)
      this.instanceVarsMut.add(key)
      return { tag: "instance" }
    }
    throw new Error("not found")
  }
}

export class Compiler {
  private scope = new Scope()
  private inScope<T>(instanceVarsMut: Set<string>, fn: () => T) {
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
            this.scope.add(stmt.binding.value)
            return {
              tag: "let",
              binding: stmt.binding.value,
              expr: this.expr(stmt.expr),
            }
          }
          default:
            throw stmt.binding
        }
      }
      case "return":
        return { tag: "return", expr: this.expr(stmt.expr) }
      case "expr":
        return { tag: "expr", expr: this.expr(stmt.expr) }
      default:
        throw stmt
    }
  }
  expr(expr: Expr): IRExpr {
    switch (expr.tag) {
      case "number":
        return { tag: "primitive", value: expr.value, class: intClass }
      case "string":
        return { tag: "primitive", value: expr.value, class: stringClass }
      case "identifier": {
        const result = this.scope.check(expr.value)
        switch (result.tag) {
          case "local":
            return { tag: "local", binding: expr.value }
          case "instance":
            return { tag: "instance", binding: expr.value }
          default:
            throw expr
        }
      }
      case "call": {
        const target = this.expr(expr.target)
        const args: IRExpr[] = []

        // TODO: sort fields so `{x: 1 y: 2}` and `{y: 2 x: 1}` are equivalent
        const selector = expr.message
          .map((field) => {
            switch (field.tag) {
              case "key":
                return field.key
              case "pair":
                args.push(this.expr(field.argument))
                return `${field.key}:`
              default:
                throw field
            }
          })
          .join("")
        return { tag: "call", target, selector, arguments: args }
      }
      case "object": {
        const irClass: IRClass = new Map()
        const instanceVarsMut: Set<string> = new Set()
        for (const field of expr.fields) {
          switch (field.tag) {
            case "key":
            case "pair":
              throw new Error("todo frames")
            case "method": {
              // TODO: sort params
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
                  default:
                    throw param
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
        const instance = new Map(
          Array.from(instanceVarsMut).map((key) => {
            const res = this.scope.check(key)
            const expr = { tag: res.tag, binding: key }
            return [key, expr]
          })
        )
        return { tag: "object", class: irClass, instance }
      }
    }
  }
  method(
    params: Binding[],
    body: Statement[],
    instanceVarsMut: Set<string>
  ): Method {
    return this.inScope(instanceVarsMut, () => {
      const simpleParams = params.map((p) => {
        switch (p.tag) {
          case "identifier":
            return p.value
          default:
            throw p
        }
      })
      return {
        tag: "eval",
        params: simpleParams,
        body: body.map((stmt) => this.statement(stmt)),
      }
    })
  }
}
