import {
  ASTLetBinding,
  ASTHandler,
  ParseStmt,
  Instance,
  ParseExpr,
  HandlerSet,
  ParseParam,
  ParseArg,
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

class Send {
  private scope = new SendScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  send(
    selector: string,
    astTarget: ParseExpr,
    astArgs: ParseArg[],
    orElse: ParseExpr | null = null
  ): IRExpr {
    const args = astArgs.map((v) => v.sendArg(this.scope))
    if (astTarget === Self) {
      const handler = this.instance.getPlaceholderHandler(selector)
      if (orElse) {
        throw new Error("trySend must be unneccessary on self")
      }
      return new IRSendDirectExpr(handler, new IRSelfExpr(), args)
    } else {
      const target = astTarget.compile(this.scope)
      if (orElse) {
        return new IRTrySendExpr(
          selector,
          astTarget.compile(this.scope),
          args,
          orElse.compile(this.scope)
        )
      } else {
        return new IRSendExpr(selector, target, args)
      }
    }
  }
}

export function compileSend(
  scope: Scope,
  selector: string,
  target: ParseExpr,
  args: ParseArg[],
  orElse: ParseExpr | null = null
) {
  return new Send(scope.instance, scope.locals).send(
    selector,
    target,
    args,
    orElse
  )
}

export function compileBlock(
  scope: Scope,
  handlers: Map<string, ASTHandler>,
  elseHandler: ASTHandler | null
) {
  const objectClass = new IRBlockClass()
  if (elseHandler) {
    objectClass.addElse(elseHandler.body.flatMap((s) => s.compile(scope)))
  }
  for (const [selector, handler] of handlers) {
    const paramScope = new BasicScope(scope.instance, scope.locals)
    // block params use parent scope, and do not start at zero
    const offset = scope.locals.allocate(handler.params.length)
    const body: IRStmt[] = []
    const params: IRParam[] = []
    for (const [argIndex, p] of handler.params.entries()) {
      params.push(p.toIR())
      body.push(...p.handler(paramScope, offset + argIndex))
    }

    body.push(...handler.body.flatMap((s) => s.compile(scope)))
    objectClass.add(selector, offset, params, body)
  }
  return objectClass
}

class Handler {
  private scope = new BasicScope(this.instance, this.locals)
  constructor(private instance: Instance, private locals: Locals) {}
  handler(handler: ASTHandler, selfBinding?: string | undefined): IRHandler {
    const body: IRStmt[] = []
    const params: IRParam[] = []
    for (const [argIndex, p] of handler.params.entries()) {
      params.push(p.toIR())
      body.push(...p.handler(this.scope, argIndex))
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
