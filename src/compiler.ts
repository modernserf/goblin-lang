import {
  ASTStmt,
  ASTExpr,
  ASTArg,
  ASTLetBinding,
  ASTMethod,
  ASTParam,
} from "./ast"
import { frame } from "./frame"
import { IRStmt, IRExpr, IRArg, IRClass, IRMethod } from "./ir"
import { intClass, stringClass } from "./stdlib"

type ScopeType = "let" | "var"
type ScopeRecord = { index: number; type: ScopeType }

class Scope {
  private locals = new Map<string, ScopeRecord>()
  private localsIndex = 0
  constructor(private instance: Instance | null = null) {}
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (res) return { tag: "local", index: res.index }
    return this.lookupInstance(key)
  }
  lookupOuterLet(key: string): IRExpr {
    const record = this.locals.get(key)
    if (record) {
      if (record.type == "var") {
        throw new Error(`cannot access var ${key} from outer scope`)
      }
      return { tag: "local", index: record.index }
    }
    return this.lookupInstance(key)
  }
  private lookupInstance(key: string): IRExpr {
    if (!this.instance) throw new Error(`Unknown binding ${key}`)
    return this.instance.lookup(key)
  }
  lookupVarIndex(key: string): number {
    const record = this.locals.get(key)
    if (!record) throw new Error(`unknown var ${key}`)
    if (record.type !== "var") throw new Error(`Binding ${key} is not var`)
    return record.index
  }
  hasLocal(key: string): boolean {
    return this.locals.has(key)
  }
  useAnon(): ScopeRecord {
    return this.newRecord("let")
  }
  useLet(key: string): ScopeRecord {
    return this.setLocal(key, this.newRecord("let"))
  }
  useVar(key: string): ScopeRecord {
    return this.setLocal(key, this.newRecord("var"))
  }
  useSet(key: string): ScopeRecord {
    const record = this.locals.get(key)
    if (!record) throw new Error(`unknown binding ${key}`)
    if (record.type !== "var") throw new Error(`Binding ${key} is not var`)
    return record
  }
  private setLocal(key: string, value: ScopeRecord): ScopeRecord {
    if (this.locals.has(key)) throw new Error(`Duplicate key ${key}`)
    this.locals.set(key, value)
    return value
  }
  private newRecord(type: ScopeType): ScopeRecord {
    return { index: this.localsIndex++, type }
  }
  getSelf(): IRExpr {
    if (!this.instance) {
      throw new Error("No self at module root")
    }
    return { tag: "self" }
  }
  newInstance(): Instance {
    return new Instance(this)
  }
}

class Instance {
  private ivarMap = new Map<string, ScopeRecord>()
  readonly ivars: IRExpr[] = []
  constructor(private parentScope: Scope) {}
  lookup(key: string): IRExpr {
    const found = this.ivarMap.get(key)
    if (found) return { tag: "ivar", index: found.index }

    const index = this.ivars.length
    this.ivars.push(this.parentScope.lookupOuterLet(key))
    this.ivarMap.set(key, { index, type: "let" })
    return { tag: "ivar", index }
  }
  newScope(): Scope {
    return new Scope(this)
  }
}

function methodParam(
  scope: Scope,
  method: IRMethod,
  argIndex: number,
  param: ASTParam
) {
  switch (param.tag) {
    case "binding":
      switch (param.binding.tag) {
        case "identifier":
          scope.useLet(param.binding.value)
          return
        case "object": {
          const record = scope.useAnon()
          const local: IRExpr = { tag: "local", index: record.index }
          method.body.push(...letStmt(scope, param.binding, local))
          return
        }
      }
    case "var":
      const record = scope.useVar(param.binding.value)
      method.effects.push({
        tag: "var",
        argIndex,
        indexInMethod: record.index,
      })
      return
  }
}

function object(
  parentScope: Scope,
  selfBinding: string | null,
  methods: Map<string, ASTMethod>
): IRExpr {
  const instance = parentScope.newInstance()
  const objectClass: IRClass = new Map()
  for (const [selector, method] of methods) {
    const scope = instance.newScope()
    const out: IRMethod = { body: [], effects: [] }
    for (const [argIndex, param] of method.params.entries()) {
      methodParam(scope, out, argIndex, param)
    }

    if (selfBinding !== null && !scope.hasLocal(selfBinding)) {
      const { index } = scope.useLet(selfBinding)
      out.body.push({ tag: "assign", index, value: { tag: "self" } })
    }

    out.body.push(...body(scope, method.body))
    objectClass.set(selector, out)
  }
  return { tag: "object", class: objectClass, ivars: instance.ivars }
}

function arg(scope: Scope, arg: ASTArg): IRArg {
  switch (arg.tag) {
    case "var":
      return { tag: "var", index: scope.lookupVarIndex(arg.value.value) }
    case "expr":
      return { tag: "value", value: expr(scope, arg.value) }
  }
}

function expr(scope: Scope, value: ASTExpr): IRExpr {
  switch (value.tag) {
    case "self":
      return scope.getSelf()
    case "integer":
      return { tag: "primitive", class: intClass, value: value.value }
    case "string":
      return { tag: "primitive", class: stringClass, value: value.value }
    case "identifier":
      return scope.lookup(value.value)
    case "call": {
      const target = expr(scope, value.target)
      const args = value.args.map((v) => arg(scope, v))
      return { tag: "call", target, selector: value.selector, args }
    }
    case "frame":
      return frame(
        value.selector,
        value.args.map((arg) => ({
          key: arg.key,
          value: expr(scope, arg.value),
        }))
      )
    case "object":
      return object(scope, null, value.methods)
  }
}

function bindExpr(
  scope: Scope,
  binding: ASTLetBinding,
  value: ASTExpr
): IRExpr {
  if (binding.tag === "identifier" && value.tag === "object") {
    return object(scope, binding.value, value.methods)
  } else {
    return expr(scope, value)
  }
}

function letStmt(
  scope: Scope,
  binding: ASTLetBinding,
  value: IRExpr
): IRStmt[] {
  switch (binding.tag) {
    case "identifier": {
      const record = scope.useLet(binding.value)
      return [{ tag: "assign", index: record.index, value }]
    }
    case "object":
      const record = scope.useAnon()
      return [
        { tag: "assign", index: record.index, value },
        ...binding.params.flatMap((param) =>
          letStmt(scope, param.value, {
            tag: "call",
            selector: param.key,
            target: value,
            args: [],
          })
        ),
      ]
  }
}

function stmt(scope: Scope, stmt: ASTStmt): IRStmt[] {
  switch (stmt.tag) {
    case "let":
      return letStmt(
        scope,
        stmt.binding,
        bindExpr(scope, stmt.binding, stmt.value)
      )
    case "var": {
      const value = expr(scope, stmt.value)
      const record = scope.useVar(stmt.binding.value)
      return [{ tag: "assign", index: record.index, value }]
    }
    case "set": {
      const value = expr(scope, stmt.value)
      const record = scope.useSet(stmt.binding.value)
      return [{ tag: "assign", index: record.index, value }]
    }
    case "return":
      return [{ tag: "return", value: expr(scope, stmt.value) }]
    case "expr":
      return [{ tag: "expr", value: expr(scope, stmt.value) }]
  }
}

function body(scope: Scope, stmts: ASTStmt[]): IRStmt[] {
  return stmts.flatMap((s) => stmt(scope, s))
}

export function program(stmts: ASTStmt[]): IRStmt[] {
  const scope = new Scope()
  return body(scope, stmts)
}
