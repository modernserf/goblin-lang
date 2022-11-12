import {
  ASTStmt,
  ASTExpr,
  ASTArg,
  ASTLetBinding,
  ASTHandler,
  ASTParam,
} from "./ast"
import { frame } from "./frame"
import {
  IRStmt,
  IRExpr,
  IRArg,
  IRClass,
  IRHandler,
  IRBlockClass,
  IRBlockHandler,
  IRParam,
  unitClass,
} from "./interpreter"
import {
  BasicScope,
  Instance,
  ObjectInstance,
  Locals,
  NilInstance,
  Scope,
  ScopeRecord,
  SendScope,
} from "./scope"
import { core, intClass, stringClass } from "./stdlib"

class Send {
  private scope = new SendScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  target(arg: ASTExpr): IRExpr {
    return this.expr(arg)
  }
  arg(arg: ASTArg): IRArg {
    switch (arg.tag) {
      case "var":
        return { tag: "var", index: this.scope.lookupVarIndex(arg.value.value) }
      case "expr":
        const value = this.expr(arg.value)
        return { tag: "value", value }
      case "do":
        switch (arg.value.tag) {
          case "object":
            return {
              tag: "do",
              class: this.block(arg.value.handlers, arg.value.else),
            }
        }
    }
  }
  private block(
    handlers: Map<string, ASTHandler>,
    elseHandler: ASTHandler | null
  ): IRBlockClass {
    const objectClass: IRBlockClass = { handlers: new Map(), else: null }
    if (elseHandler) {
      const offset = this.locals.allocate(0)
      objectClass.else = {
        body: this.body(elseHandler.body),
        offset,
        params: [],
      }
    }
    for (const [selector, handler] of handlers) {
      const paramScope = new Handler(this.instance, this.locals)
      // block params use parent scope, and do not start at zero
      const offset = this.locals.allocate(handler.params.length)
      const out: IRBlockHandler = { body: [], offset, params: [] }
      for (const [argIndex, p] of handler.params.entries()) {
        out.params.push(param(p))
        out.body.push(...paramScope.param(offset + argIndex, p))
      }
      out.body.push(...this.body(handler.body))
      objectClass.handlers.set(selector, out)
    }
    return objectClass
  }
  private expr(value: ASTExpr): IRExpr {
    return new Expr(this.scope).expr(value)
  }
  private body(stmts: ASTStmt[]): IRStmt[] {
    const stmtScope = new Stmt(this.scope)
    return stmts.flatMap((s) => stmtScope.stmt(s))
  }
}

class Handler {
  private scope = new BasicScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  handler(handler: ASTHandler, selfBinding: string | null): IRHandler {
    const out: IRHandler = { tag: "object", body: [], params: [] }

    for (const [argIndex, p] of handler.params.entries()) {
      out.params.push(param(p))
      out.body.push(...this.param(argIndex, p))
    }

    out.body.push(...this.selfBinding(selfBinding))
    out.body.push(...this.body(handler.body))
    return out
  }
  param(offset: number, param: ASTParam): IRStmt[] {
    switch (param.tag) {
      case "binding":
        switch (param.binding.tag) {
          case "identifier":
            this.useLetArg(param.binding.value, offset)
            return []
          case "object": {
            const local: IRExpr = { tag: "local", index: offset }
            return this.let(param.binding, local)
          }
        }
      case "var":
        this.useVarArg(param.binding.value, offset)
        return []
      case "do":
        this.useBlockArg(param.binding.value, offset)
        return []
    }
  }
  selfBinding(selfBinding: string | null): IRStmt[] {
    if (!selfBinding) return []
    return new Let(this.locals).compile(
      { tag: "identifier", value: selfBinding },
      { tag: "self" }
    )
  }
  private body(stmts: ASTStmt[]): IRStmt[] {
    const stmtScope = new Stmt(this.scope)
    return stmts.flatMap((s) => stmtScope.stmt(s))
  }
  private useLetArg(key: string, index: number) {
    return this.locals.set(key, { index, type: "let" })
  }
  private useVarArg(key: string, index: number) {
    return this.locals.set(key, { index, type: "var" })
  }
  private useBlockArg(key: string, index: number) {
    return this.locals.set(key, { index, type: "do" })
  }
  private let(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    return new Let(this.locals).compile(binding, value)
  }
}

function param(p: ASTParam): IRParam {
  switch (p.tag) {
    case "binding":
      return { tag: "value" }
    case "do":
      return { tag: "do" }
    case "var":
      return { tag: "var" }
  }
}

class Expr {
  constructor(private scope: Scope) {}
  expr(value: ASTExpr, selfBinding: string | null = null): IRExpr {
    switch (value.tag) {
      case "self":
        return this.scope.instance.self()
      case "integer":
        return { tag: "primitive", class: intClass, value: value.value }
      case "string":
        return { tag: "primitive", class: stringClass, value: value.value }
      case "identifier":
        return this.scope.lookup(value.value)
      case "send": {
        const argScope = new Send(this.scope.instance, this.scope.locals)
        const target = argScope.target(value.target)
        const args = value.args.map((v) => argScope.arg(v))
        return { tag: "send", target, selector: value.selector, args }
      }
      case "frame":
        return frame(
          value.selector,
          value.args.map((arg) => ({
            key: arg.key,
            value: this.expr(arg.value),
          }))
        )
      case "object": {
        const instance = new ObjectInstance(this.scope)
        const objectClass: IRClass = {
          handlers: new Map(),
          else: null,
        }
        if (value.else) {
          const h = new Handler(instance, new Locals(value.else.params.length))
          objectClass.else = h.handler(value.else, selfBinding)
        }

        for (const [selector, handler] of value.handlers) {
          const h = new Handler(instance, new Locals(handler.params.length))
          objectClass.handlers.set(selector, h.handler(handler, selfBinding))
        }
        return { tag: "object", class: objectClass, ivars: instance.ivars }
      }
      case "unit":
        return { tag: "object", class: unitClass, ivars: [] }
    }
  }
}

class Let {
  constructor(private locals: Locals) {}
  compile(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    switch (binding.tag) {
      case "identifier": {
        const record = this.useLet(binding.value)
        return [{ tag: "assign", index: record.index, value }]
      }
      case "object":
        const record = this.useAnon()
        return [
          { tag: "assign", index: record.index, value },
          ...binding.params.flatMap((param) =>
            this.compile(param.value, {
              tag: "send",
              selector: param.key,
              target: value,
              args: [],
            })
          ),
        ]
    }
  }
  private useAnon(): ScopeRecord {
    return this.locals.new("let")
  }
  private useLet(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.new("let"))
  }
}

class Stmt {
  private locals = this.scope.locals
  constructor(private scope: Scope) {}
  stmt(stmt: ASTStmt): IRStmt[] {
    switch (stmt.tag) {
      case "let":
        return this.let(stmt.binding, this.bindExpr(stmt.binding, stmt.value))
      case "var": {
        const value = this.expr(stmt.value)
        const record = this.useVar(stmt.binding.value)
        return [{ tag: "assign", index: record.index, value }]
      }
      case "set": {
        const value = this.expr(stmt.value)
        return [
          {
            tag: "assign",
            index: this.scope.lookupVarIndex(stmt.binding.value),
            value,
          },
        ]
      }
      case "provide": {
        return stmt.args.map((arg) => {
          switch (arg.value.tag) {
            case "do":
            case "var":
              throw "todo"
            case "expr":
              return {
                tag: "provide",
                key: arg.key,
                value: this.expr(arg.value.value),
              }
          }
        })
      }
      case "using": {
        return stmt.params.flatMap((param) => {
          switch (param.value.tag) {
            case "do":
            case "var":
              throw "todo"
            case "binding":
              return this.let(param.value.binding, {
                tag: "using",
                key: param.key,
              })
          }
        })
      }
      case "import": {
        /* istanbul ignore next */
        if (stmt.source.value !== "core") {
          throw "todo imports"
        }
        return this.let(stmt.binding, {
          tag: "object",
          ivars: [],
          class: core,
        })
      }
      case "defer":
        return [{ tag: "defer", body: this.body(stmt.body) }]
      case "return":
        return [{ tag: "return", value: this.expr(stmt.value) }]
      case "expr":
        return [{ tag: "expr", value: this.expr(stmt.value) }]
    }
  }
  private bindExpr(binding: ASTLetBinding, value: ASTExpr): IRExpr {
    if (binding.tag === "identifier") {
      return this.expr(value, binding.value)
    } else {
      return this.expr(value)
    }
  }
  private expr(value: ASTExpr, selfBinding: string | null = null): IRExpr {
    return new Expr(this.scope).expr(value, selfBinding)
  }
  private body(stmts: ASTStmt[]): IRStmt[] {
    return stmts.flatMap((s) => this.stmt(s))
  }
  private useVar(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.new("var"))
  }
  private let(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    return new Let(this.locals).compile(binding, value)
  }
}

export function program(stmts: ASTStmt[]): IRStmt[] {
  const locals = new Locals()
  const instance = new NilInstance()
  const scope = new BasicScope(instance, locals)
  const stmtScope = new Stmt(scope)
  return stmts.flatMap((s) => stmtScope.stmt(s))
}
