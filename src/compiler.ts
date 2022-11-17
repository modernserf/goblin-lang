import {
  ASTStmt,
  ASTArg,
  ASTLetBinding,
  ASTHandler,
  ASTParam,
  ParseStmt,
  Instance,
  ParseExpr,
  HandlerSet,
} from "./interface"
import {
  IRClass,
  IRBlockClass,
  IRObjectExpr,
  IRIvarExpr,
  IRModuleExpr,
  IRUseExpr,
  IRSendExpr,
  IRSelfExpr,
  IRLocalExpr,
  IRSendDirectExpr,
  IRAssignStmt,
  IRReturnStmt,
  IRDeferStmt,
  IRProvideStmt,
  IRObjectHandler,
  IRVarArg,
  IRValueArg,
  IRDoArg,
} from "./interpreter"
import { constObject } from "./optimize"
import {
  BasicScope,
  ObjectInstance,
  SendScope,
  RootScope,
  LocalsImpl,
} from "./scope"
import {
  IRArg,
  IRExpr,
  IRHandler,
  IRParam,
  IRStmt,
  Value,
  Locals,
  Scope,
  ScopeRecord,
} from "./interface"
import { Self } from "./ast"

export class Send {
  private scope = new SendScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  send(selector: string, astTarget: ParseExpr, astArgs: ASTArg[]): IRExpr {
    const args = astArgs.map((v) => this.arg(v))
    if (astTarget === Self) {
      const handler = this.instance.getPlaceholderHandler(selector)
      return new IRSendDirectExpr(handler, new IRSelfExpr(), args)
    } else {
      const target = this.expr(astTarget)
      return new IRSendExpr(selector, target, args)
    }
  }
  private arg(arg: ASTArg): IRArg {
    switch (arg.tag) {
      case "var":
        return new IRVarArg(this.scope.lookupVarIndex(arg.value.value))
      case "expr":
        return new IRValueArg(this.expr(arg.value))
      case "do":
        return new IRDoArg(this.block(arg.value.handlers, arg.value.else))
    }
  }
  private block(
    handlers: Map<string, ASTHandler>,
    elseHandler: ASTHandler | null
  ): IRBlockClass {
    const objectClass = new IRBlockClass()
    if (elseHandler) {
      objectClass.addElse(this.body(elseHandler.body))
    }
    for (const [selector, handler] of handlers) {
      const paramScope = new Handler(this.instance, this.locals)
      // block params use parent scope, and do not start at zero
      const offset = this.locals.allocate(handler.params.length)
      const body: IRStmt[] = []
      const params: IRParam[] = []
      for (const [argIndex, p] of handler.params.entries()) {
        params.push(param(p))
        body.push(...paramScope.param(offset + argIndex, p))
      }

      body.push(...this.body(handler.body))
      objectClass.add(selector, offset, params, body)
    }
    return objectClass
  }
  private expr(value: ParseExpr): IRExpr {
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
  handler(handler: ASTHandler, selfBinding?: string | undefined): IRHandler {
    const body: IRStmt[] = []
    const params: IRParam[] = []
    for (const [argIndex, p] of handler.params.entries()) {
      params.push(param(p))
      body.push(...this.param(argIndex, p))
    }

    body.push(...this.selfBinding(selfBinding))
    body.push(...this.body(handler.body))
    return new IRObjectHandler(params, body)
  }
  param(offset: number, param: ASTParam): IRStmt[] {
    switch (param.tag) {
      case "binding":
        switch (param.binding.tag) {
          case "identifier":
            this.useLetArg(param.binding.value, offset)
            return []
          case "object": {
            const local: IRExpr = new IRLocalExpr(offset)
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
  selfBinding(selfBinding: string | undefined): IRStmt[] {
    if (!selfBinding) return []
    return new Let(this.locals).compile(
      { tag: "identifier", value: selfBinding },
      new IRSelfExpr()
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

export class Expr {
  constructor(private scope: Scope) {}
  expr(parseValue: ParseExpr, selfBinding?: string | undefined): IRExpr {
    return parseValue.compile(this.scope, selfBinding)
  }
}

export function compileObject(
  value: HandlerSet,
  scope: Scope,
  selfBinding: string | undefined
) {
  const instance = new ObjectInstance(scope)
  const objectClass = new IRClass()
  if (value.else) {
    const h = new Handler(instance, new LocalsImpl(value.else.params.length))
    objectClass.addElse(h.handler(value.else, selfBinding))
  }

  for (const [selector, handler] of value.handlers) {
    const h = new Handler(instance, new LocalsImpl(handler.params.length))
    objectClass.add(selector, h.handler(handler, selfBinding))
  }

  instance.compileSelfHandlers(objectClass)
  return constObject(objectClass, instance.ivars)
}

class Let {
  constructor(private locals: Locals) {}
  compile(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    switch (binding.tag) {
      case "identifier": {
        const record = this.useLet(binding.value)
        return [new IRAssignStmt(record.index, value)]
      }
      case "object":
        const record = this.useAs(binding.as)
        return [
          new IRAssignStmt(record.index, value),
          ...binding.params.flatMap((param) =>
            this.compile(param.value, new IRSendExpr(param.key, value, []))
          ),
        ]
    }
  }
  private useAs(as: string | null): ScopeRecord {
    if (as === null) return this.locals.create("let")
    return this.useLet(as)
  }
  private useLet(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.create("let"))
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
        return [new IRAssignStmt(record.index, value)]
      }
      case "set": {
        const value = this.expr(stmt.value)
        return [
          new IRAssignStmt(
            this.scope.lookupVarIndex(stmt.binding.value),
            value
          ),
        ]
      }
      case "provide": {
        return stmt.args.map((arg) => {
          switch (arg.value.tag) {
            case "do":
            case "var":
              throw "todo: provide do/var"
            case "expr":
              return new IRProvideStmt(arg.key, this.expr(arg.value.value))
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
              return this.let(param.value.binding, new IRUseExpr(param.key))
          }
        })
      }
      case "import":
        return this.let(stmt.binding, new IRModuleExpr(stmt.source.value))
      case "defer":
        return [new IRDeferStmt(this.body(stmt.body))]
      case "return":
        return [new IRReturnStmt(this.expr(stmt.value))]
      case "expr":
        return [this.expr(stmt.value)]
    }
  }
  protected bindExpr(binding: ASTLetBinding, value: ParseExpr): IRExpr {
    if (binding.tag === "identifier") {
      return this.expr(value, binding.value)
    } else {
      return this.expr(value)
    }
  }
  protected expr(value: ParseExpr, selfBinding?: string | undefined): IRExpr {
    return new Expr(this.scope).expr(value, selfBinding)
  }
  private body(stmts: ASTStmt[]): IRStmt[] {
    return stmts.flatMap((s) => this.stmt(s))
  }
  private useVar(key: string): ScopeRecord {
    return this.locals.set(key, this.locals.create("var"))
  }
  protected let(binding: ASTLetBinding, value: IRExpr): IRStmt[] {
    return new Let(this.locals).compile(binding, value)
  }
}

class RootStmt extends Stmt {
  private exports = new Map<string, IRExpr>()
  module(stmts: ASTStmt[]): IRStmt[] {
    const body = stmts.flatMap((stmt) => this.stmt(stmt))
    const exportClass = new IRClass()
    const ivars: IRExpr[] = []
    for (const [i, [key, value]] of Array.from(this.exports).entries()) {
      ivars[i] = value
      exportClass.add(key, new IRObjectHandler([], [new IRIvarExpr(i)]))
    }

    body.push(new IRObjectExpr(exportClass, ivars))
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

export function coreModule(stmts: ParseStmt[], nativeValue: Value): IRStmt[] {
  const scope = new RootScope()
  const rec = scope.locals.set("native", scope.locals.create("let"))
  const stmtScope = new RootStmt(scope)
  return [
    new IRAssignStmt(rec.index, nativeValue),
    ...stmtScope.module(stmts.map((s) => s.stmt())),
  ]
}

export function program(stmts: ParseStmt[]): IRStmt[] {
  const stmtScope = new RootStmt(new RootScope())
  return stmts.flatMap((s) => stmtScope.stmt(s.stmt()))
}
