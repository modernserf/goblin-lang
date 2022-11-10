import {
  ASTStmt,
  ASTExpr,
  ASTArg,
  ASTLetBinding,
  ASTMethod,
  ASTParam,
} from "./ast"
import { frame } from "./frame"
import {
  IRStmt,
  IRExpr,
  IRArg,
  IRClass,
  IRMethod,
  IRBlockClass,
  IRBlockMethod,
} from "./ir"
import { core, intClass, stringClass } from "./stdlib"

type ScopeType = "let" | "var" | "block"
type ScopeRecord = { index: number; type: ScopeType }

export class ReferenceError {
  constructor(readonly key: string) {}
}
export class NotVarError {
  constructor(readonly key: string) {}
}
export class OuterScopeVarError {
  constructor(readonly key: string) {}
}
export class NoModuleSelfError {}
export class BlockReferenceError {
  constructor(readonly key: string) {}
}

class Scope {
  private locals = new Map<string, ScopeRecord>()
  constructor(
    private instance: Instance | null = null,
    private localsIndex = 0
  ) {}
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (res) {
      if (res.type === "block") throw new BlockReferenceError(key)
      return { tag: "local", index: res.index }
    }
    return this.lookupInstance(key)
  }
  lookupOuterLet(key: string): IRExpr {
    const record = this.locals.get(key)
    if (record) {
      if (record.type == "var") throw new OuterScopeVarError(key)
      if (record.type === "block") throw new BlockReferenceError(key)
      return { tag: "local", index: record.index }
    }
    return this.lookupInstance(key)
  }
  private lookupInstance(key: string): IRExpr {
    if (!this.instance) throw new ReferenceError(key)
    return this.instance.lookup(key)
  }
  lookupVar(key: string): number {
    const record = this.locals.get(key)
    if (!record) throw new ReferenceError(key)
    if (record.type !== "var") throw new NotVarError(key)
    return record.index
  }
  // any value can be passed as a block
  lookupBlock(key: string): IRExpr {
    const record = this.locals.get(key)
    if (record) {
      return { tag: "local", index: record.index }
    }
    return this.lookupInstance(key)
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
  private setLocal(key: string, value: ScopeRecord): ScopeRecord {
    this.locals.set(key, value)
    return value
  }
  private newRecord(type: ScopeType): ScopeRecord {
    return { index: this.localsIndex++, type }
  }
  getSelf(): IRExpr {
    if (!this.instance) throw new NoModuleSelfError()
    return { tag: "self" }
  }
  newInstance(): Instance {
    return new Instance(this)
  }
  useLetArg(key: string, index: number) {
    return this.setLocal(key, { index, type: "let" })
  }
  useVarArg(key: string, index: number) {
    return this.setLocal(key, { index, type: "var" })
  }
  useBlockArg(key: string, index: number) {
    return this.setLocal(key, { index, type: "block" })
  }
  newBlock(arity: number) {
    const prevIndex = this.localsIndex
    this.localsIndex += arity
    return prevIndex
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
  newScope(arity: number): Scope {
    return new Scope(this, arity)
  }
}

function methodParam(
  scope: Scope,
  argIndex: number,
  param: ASTParam
): IRStmt[] {
  switch (param.tag) {
    case "binding":
      switch (param.binding.tag) {
        case "identifier":
          scope.useLetArg(param.binding.value, argIndex)
          return []
        case "object": {
          const local: IRExpr = { tag: "local", index: argIndex }
          return letStmt(scope, param.binding, local)
        }
      }
    case "var":
      scope.useVarArg(param.binding.value, argIndex)
      return []
    case "block":
      scope.useBlockArg(param.binding.value, argIndex)
      return []
  }
}

function object(
  parentScope: Scope,
  selfBinding: string | null,
  methods: Map<string, ASTMethod>,
  elseHandler: ASTStmt[] | null
): IRExpr {
  const instance = parentScope.newInstance()
  const objectClass: IRClass = {
    methods: new Map(),
    elseHandler: null,
  }
  if (elseHandler) {
    objectClass.elseHandler = []
    const scope = instance.newScope(0)
    if (selfBinding !== null) {
      const { index } = scope.useLet(selfBinding)
      objectClass.elseHandler.push({
        tag: "assign",
        index,
        value: { tag: "self" },
      })
    }

    objectClass.elseHandler.push(...body(scope, elseHandler))
  }

  for (const [selector, method] of methods) {
    const scope = instance.newScope(method.params.length)
    const out: IRMethod = { tag: "object", body: [] }

    for (const [argIndex, param] of method.params.entries()) {
      out.body.push(...methodParam(scope, argIndex, param))
    }

    if (selfBinding !== null) {
      const { index } = scope.useLet(selfBinding)
      out.body.push({ tag: "assign", index, value: { tag: "self" } })
    }

    out.body.push(...body(scope, method.body))
    objectClass.methods.set(selector, out)
  }
  return { tag: "object", class: objectClass, ivars: instance.ivars }
}

function block(
  scope: Scope,
  methods: Map<string, ASTMethod>,
  elseHandler: ASTStmt[] | null
): IRBlockClass {
  const objectClass: IRBlockClass = { methods: new Map(), elseHandler: null }
  if (elseHandler) {
    objectClass.elseHandler = body(scope, elseHandler)
  }
  for (const [selector, method] of methods) {
    // block params use parent scope, and do not start at zero
    const offset = scope.newBlock(method.params.length)
    const out: IRBlockMethod = { body: [], offset }
    for (const [argIndex, param] of method.params.entries()) {
      out.body.push(...methodParam(scope, offset + argIndex, param))
    }
    out.body.push(...body(scope, method.body))
    objectClass.methods.set(selector, out)
  }
  return objectClass
}

function arg(scope: Scope, arg: ASTArg): IRArg {
  switch (arg.tag) {
    case "var":
      return { tag: "var", index: scope.lookupVar(arg.value.value) }
    case "expr":
      return { tag: "value", value: expr(scope, arg.value) }
    case "block":
      switch (arg.value.tag) {
        case "identifier":
          return {
            tag: "value",
            value: scope.lookupBlock(arg.value.value),
          }
        case "object":
          return {
            tag: "block",
            class: block(scope, arg.value.methods, arg.value.elseHandler),
          }
      }
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
      // TODO: lookup should fail on block vals _except_ in call target & block args
      return scope.lookup(value.value)
    case "send": {
      const target =
        value.target.tag === "identifier"
          ? scope.lookupBlock(value.target.value)
          : expr(scope, value.target)
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
      return object(scope, null, value.methods, value.elseHandler)
    case "use":
      return { tag: "use", key: value.value }
  }
}

function bindExpr(
  scope: Scope,
  binding: ASTLetBinding,
  value: ASTExpr
): IRExpr {
  if (binding.tag === "identifier" && value.tag === "object") {
    return object(scope, binding.value, value.methods, value.elseHandler)
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
      return [
        { tag: "assign", index: scope.lookupVar(stmt.binding.value), value },
      ]
    }
    case "provide": {
      const value = expr(scope, stmt.value)
      return [{ tag: "provide", key: stmt.binding.value, value }]
    }
    case "import": {
      /* istanbul ignore next */
      if (stmt.source.value !== "core") {
        throw "todo imports"
      }
      return letStmt(scope, stmt.binding, {
        tag: "object",
        ivars: [],
        class: core,
      })
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
