import {
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
  IRSendExpr,
  IRSelfExpr,
  IRLocalExpr,
  IRSendDirectExpr,
  IRAssignStmt,
  IRObjectHandler,
  IRVarArg,
  IRValueArg,
  IRDoArg,
  IRTrySendExpr,
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
      const target = astTarget.compile(this.scope)
      return new IRSendExpr(selector, target, args)
    }
  }
  trySend(
    selector: string,
    astTarget: ParseExpr,
    astArgs: ASTArg[],
    orElse: ParseExpr
  ): IRExpr {
    const args = astArgs.map((v) => this.arg(v))
    if (astTarget === Self) {
      this.instance.getPlaceholderHandler(selector)
      throw new Error("trySend must be unneccessary on self")
    } else {
      return new IRTrySendExpr(
        selector,
        astTarget.compile(this.scope),
        args,
        orElse.compile(this.scope)
      )
    }
  }
  private arg(arg: ASTArg): IRArg {
    switch (arg.tag) {
      case "var":
        return new IRVarArg(this.scope.lookupVarIndex(arg.value.value))
      case "expr":
        return new IRValueArg(arg.value.compile(this.scope))
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
  private body(stmts: ParseStmt[]): IRStmt[] {
    return stmts.flatMap((s) => s.compile(this.scope))
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
  elseHandler(handler: ASTHandler, selfBinding?: string | undefined): IRStmt[] {
    const body: IRStmt[] = []
    body.push(...this.selfBinding(selfBinding))
    body.push(...this.body(handler.body))
    return body
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
  private body(stmts: ParseStmt[]): IRStmt[] {
    return stmts.flatMap((s) => s.compile(this.scope))
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

export function compileObject(
  value: HandlerSet,
  scope: Scope,
  selfBinding: string | undefined
) {
  const instance = new ObjectInstance(scope)
  const objectClass = new IRClass()
  if (value.else) {
    const h = new Handler(instance, new LocalsImpl(value.else.params.length))
    objectClass.addElse(h.elseHandler(value.else, selfBinding))
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

export function compileLet(
  scope: Scope,
  binding: ASTLetBinding,
  value: IRExpr
) {
  return new Let(scope.locals).compile(binding, value)
}

export function coreModule(stmts: ParseStmt[], nativeValue: Value): IRStmt[] {
  const scope = new RootScope()
  const rec = scope.locals.set("native", scope.locals.create("let"))
  return [
    new IRAssignStmt(rec.index, nativeValue),
    ...stmts.flatMap((stmt) => stmt.compile(scope)),
    scope.compileExports(),
  ]
}

export function program(stmts: ParseStmt[]): IRStmt[] {
  const scope = new RootScope()
  return stmts.flatMap((stmt) => stmt.compile(scope))
}
