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
  Value,
} from "./interpreter"
import { constObject } from "./optimize"
import {
  BasicScope,
  Instance,
  ObjectInstance,
  Locals,
  Scope,
  ScopeRecord,
  SendScope,
  RootScope,
} from "./scope"
import { floatClass, intClass, stringClass } from "./primitive"

class Send {
  private scope = new SendScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  send(selector: string, astTarget: ASTExpr, astArgs: ASTArg[]): IRExpr {
    const args = astArgs.map((v) => this.arg(v))
    if (astTarget.tag === "self") {
      const handler = this.instance.getPlaceholderHandler(selector)
      return { tag: "sendDirect", target: astTarget, handler, args }
    } else {
      const target = this.expr(astTarget)
      return { tag: "send", target, selector, args }
    }
  }
  private arg(arg: ASTArg): IRArg {
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
        return this.literal(intClass, value.value)
      case "float":
        return this.literal(floatClass, value.value)
      case "string":
        return this.literal(stringClass, value.value)
      case "identifier":
        return this.scope.lookup(value.value)
      case "send":
        return new Send(this.scope.instance, this.scope.locals).send(
          value.selector,
          value.target,
          value.args
        )
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

        instance.compileSelfHandlers(objectClass)
        return constObject(objectClass, instance.ivars)
      }
      case "unit":
        return {
          tag: "constant",
          value: { tag: "object", class: unitClass, ivars: [] },
        }
    }
  }
  private literal(cls: IRClass, value: any): IRExpr {
    return {
      tag: "constant",
      value: { tag: "primitive", class: cls, value },
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
        const record = this.useAs(binding.as)
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
  private useAs(as: string | null): ScopeRecord {
    if (as === null) return this.locals.new("let")
    return this.useLet(as)
  }
  private useLet(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.new("let"))
  }
}

export class ScopedExportError {
  constructor(readonly binding: ASTLetBinding) {}
}
export class DuplicateExportError {
  constructor(readonly key: string) {}
}

class Stmt {
  private locals = this.scope.locals
  constructor(protected scope: Scope) {}
  stmt(stmt: ASTStmt): IRStmt[] {
    switch (stmt.tag) {
      case "let":
        if (stmt.export) throw new ScopedExportError(stmt.binding)
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
              throw "todo: provide do/var"
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
              throw "todo: using do/var"
            case "binding":
              return this.let(param.value.binding, {
                tag: "using",
                key: param.key,
              })
          }
        })
      }
      case "import":
        return this.let(stmt.binding, { tag: "module", key: stmt.source.value })
      case "defer":
        return [{ tag: "defer", body: this.body(stmt.body) }]
      case "return":
        return [{ tag: "return", value: this.expr(stmt.value) }]
      case "expr":
        return [{ tag: "expr", value: this.expr(stmt.value) }]
    }
  }
  protected bindExpr(binding: ASTLetBinding, value: ASTExpr): IRExpr {
    if (binding.tag === "identifier") {
      return this.expr(value, binding.value)
    } else {
      return this.expr(value)
    }
  }
  protected expr(value: ASTExpr, selfBinding: string | null = null): IRExpr {
    return new Expr(this.scope).expr(value, selfBinding)
  }
  private body(stmts: ASTStmt[]): IRStmt[] {
    return stmts.flatMap((s) => this.stmt(s))
  }
  private useVar(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.new("var"))
  }
  protected let(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    return new Let(this.locals).compile(binding, value)
  }
}

class RootStmt extends Stmt {
  private exports = new Map<string, IRExpr>()
  module(stmts: ASTStmt[]): IRStmt[] {
    const body = stmts.flatMap((stmt) => this.stmt(stmt))
    const exportClass: IRClass = {
      handlers: new Map(),
      else: null,
    }
    const ivars: IRExpr[] = []
    for (const [i, [key, value]] of Array.from(this.exports).entries()) {
      ivars[i] = value
      exportClass.handlers.set(key, {
        tag: "object",
        params: [],
        body: [{ tag: "expr", value: { tag: "ivar", index: i } }],
      })
    }
    body.push({
      tag: "expr",
      value: { tag: "object", class: exportClass, ivars },
    })
    return body
  }
  stmt(stmt: ASTStmt): IRStmt[] {
    if (stmt.tag === "let" && stmt.export) {
      const stmts = this.let(
        stmt.binding,
        this.bindExpr(stmt.binding, stmt.value)
      )
      this.getExports(stmt.binding)
      return stmts
    }
    return super.stmt(stmt)
  }
  private getExports(binding: ASTLetBinding) {
    switch (binding.tag) {
      case "identifier":
        if (this.exports.has(binding.value))
          throw new DuplicateExportError(binding.value)
        const value = this.scope.lookup(binding.value)
        this.exports.set(binding.value, value)
        return
      case "object":
        for (const param of binding.params) {
          this.getExports(param.value)
        }
    }
  }
}

export function coreModule(stmts: ASTStmt[], nativeValue: Value): IRStmt[] {
  const scope = new RootScope()
  const rec = scope.locals.set("native", scope.locals.new("let"))
  const stmtScope = new RootStmt(scope)
  return [
    {
      tag: "assign",
      index: rec.index,
      value: { tag: "constant", value: nativeValue },
    },
    ...stmtScope.module(stmts),
  ]
}

export function program(stmts: ASTStmt[]): IRStmt[] {
  const stmtScope = new RootStmt(new RootScope())
  return stmts.flatMap((s) => stmtScope.stmt(s))
}
