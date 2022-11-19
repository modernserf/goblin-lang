import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import {
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  InvalidImportBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  Instance,
  IRExpr,
  IRHandler,
  IRParam,
  IRStmt,
  ParseArgs,
  ParseBinding,
  ParseExpr,
  ParseHandler,
  ParseParams,
  ParseStmt,
  PartialHandler,
  Scope,
  ScopeRecord,
} from "./interface"
import {
  IRAssignStmt,
  IRBlockClassBuilder as IRBlockClass,
  IRElseHandler,
  IRLocalExpr,
  IRModuleExpr,
  IRObjectHandler,
} from "./ir"
import { IRClass, PrimitiveValue, unit } from "./value"
import { constObject } from "./optimize"
import { ParamsBuilder } from "./params"
import { floatClass, intClass, stringClass } from "./primitive"
import { BasicScope, LocalsImpl, ObjectInstance } from "./scope"
import { ExprStmt } from "./stmt"

export const Self: ParseExpr = {
  compile(scope) {
    return scope.instance.self()
  },
}

export const Unit: ParseExpr = {
  compile() {
    return unit
  },
}

export class ParseInt implements ParseExpr {
  constructor(private value: number) {}
  compile(): IRExpr {
    return new PrimitiveValue(intClass, this.value)
  }
}

export class ParseFloat implements ParseExpr {
  constructor(private value: number) {}
  compile(): IRExpr {
    return new PrimitiveValue(floatClass, this.value)
  }
}

export class ParseString implements ParseExpr {
  constructor(private value: string) {}
  compile(): IRExpr {
    return new PrimitiveValue(stringClass, this.value)
  }
  importSource(scope: Scope): IRExpr {
    return new IRModuleExpr(this.value)
  }
}

export class ParseIdent implements ParseExpr, ParseBinding {
  constructor(private value: string) {}
  compile(scope: Scope): IRExpr {
    return scope.lookup(this.value)
  }
  var(scope: Scope, expr: ParseExpr): IRStmt[] {
    const value = expr.compile(scope)
    const record = scope.locals.set(this.value, scope.locals.create("var"))
    return [new IRAssignStmt(record.index, value)]
  }
  let(scope: Scope, value: IRExpr): IRStmt[] {
    const record = useLet(scope, this.value)
    return [new IRAssignStmt(record.index, value)]
  }
  selfBinding(scope: Scope): IRStmt[] {
    return this.let(scope, Self.compile(scope))
  }
  set(scope: Scope, expr: ParseExpr): IRStmt[] {
    const value = expr.compile(scope)
    return [new IRAssignStmt(scope.lookupVarIndex(this.value), value)]
  }
  setInPlace(scope: Scope, expr: ParseExpr): IRStmt[] {
    if (expr === this) throw new InvalidSetTargetError()
    const value = expr.compile(scope)
    return [new IRAssignStmt(scope.lookupVarIndex(this.value), value)]
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    throw new InvalidImportBindingError()
  }
  export(scope: Scope): void {
    scope.addExport(this.value)
  }
  handler(scope: Scope, offset: number): IRStmt[] {
    scope.locals.set(this.value, { index: offset, type: "let" })
    return []
  }
}

export class ParseDestructure implements ParseBinding {
  constructor(private params: ParseParams, private as: string | null) {}
  let(scope: Scope, value: IRExpr): IRStmt[] {
    const record = useAs(scope, this.as)
    return [
      new IRAssignStmt(record.index, value),
      ...this.params.let(scope, value),
    ]
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    if (this.as) throw new InvalidImportBindingError()
    return this.params.import(scope, source)
  }
  var(scope: Scope, expr: ParseExpr): IRStmt[] {
    throw new InvalidVarBindingError()
  }
  /* istanbul ignore next */
  set(scope: Scope, expr: ParseExpr): IRStmt[] {
    throw new Error("unreachable")
  }
  selfBinding(scope: Scope): IRStmt[] {
    return []
  }
  export(scope: Scope): void {
    if (this.as) {
      scope.addExport(this.as)
    }
    this.params.export(scope)
  }
  handler(scope: Scope, offset: number): IRStmt[] {
    if (this.as) {
      scope.locals.set(this.as, { index: offset, type: "let" })
    }
    return this.let(scope, new IRLocalExpr(offset))
  }
}

export class ParseParens implements ParseExpr {
  constructor(private expr: ParseExpr) {}
  compile(scope: Scope): IRExpr {
    return this.expr.compile(scope)
  }
}

class IRClassBuilder {
  private partials = new Map<string, PartialHandler[]>()
  private handlers: Map<string, IRHandler> = new Map()
  private elseHandler: IRHandler | null = null
  addPartial(selector: string, partial: PartialHandler): this {
    const arr = this.partials.get(selector) || []
    arr.push(partial)
    this.partials.set(selector, arr)
    return this
  }
  addFinal(
    selector: string,
    scope: Scope,
    params: IRParam[],
    head: IRStmt[],
    body: ParseStmt[]
  ): this {
    if (this.handlers.has(selector)) {
      throw new DuplicateHandlerError(selector)
    }
    const partials = this.partials.get(selector) || []
    this.partials.delete(selector)

    const fullBody = partials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))

    this.handlers.set(
      selector,
      new IRObjectHandler(params, [...head, ...fullBody])
    )
    return this
  }
  addElse(body: IRStmt[]): this {
    if (this.elseHandler) {
      throw new DuplicateElseHandlerError()
    }
    this.elseHandler = new IRElseHandler(body)
    return this
  }
  build(): IRClass {
    if (this.partials.size) {
      throw "todo: allow partials with no finals"
    }

    return new IRClass(this.handlers, this.elseHandler)
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding?: ParseBinding | undefined): IRExpr {
    const cls = new IRClassBuilder()
    const instance = new ObjectInstance(scope)
    for (const handler of this.handlers) {
      handler.addToClass(instance, cls, selfBinding)
    }
    const builtClass = cls.build()
    instance.compileSelfHandlers(builtClass)
    return constObject(builtClass, instance.ivars)
  }
}

export class ParseFrame implements ParseExpr {
  constructor(private args: ParseArgs) {}
  compile(scope: Scope): IRExpr {
    return this.args.frame(scope)
  }
}

export class ParseSend implements ParseExpr {
  constructor(private target: ParseExpr, private args: ParseArgs) {}
  compile(scope: Scope): IRExpr {
    return this.args.send(scope, this.target, null)
  }
  setInPlace(scope: Scope, expr: ParseExpr): IRStmt[] {
    if (!this.target.setInPlace) throw new InvalidSetTargetError()
    return this.target.setInPlace(scope, expr)
  }
}

export class ParseTrySend implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private args: ParseArgs,
    private orElse: ParseExpr
  ) {}
  compile(scope: Scope): IRExpr {
    return this.args.send(scope, this.target, this.orElse)
  }
}

export class ParseUnaryOp implements ParseExpr {
  constructor(private target: ParseExpr, private operator: string) {}
  compile(scope: Scope): IRExpr {
    return new ArgsBuilder().key(this.operator).send(scope, this.target, null)
  }
}

export class ParseBinaryOp implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private operator: string,
    private operand: ParseExpr
  ) {}
  compile(scope: Scope): IRExpr {
    return new ArgsBuilder()
      .pair(this.operator, new ValueArg(this.operand))
      .build()
      .send(scope, this.target, null)
  }
}

export class ParseDoBlock implements ParseExpr {
  constructor(private body: ParseStmt[]) {}
  compile(scope: Scope): IRExpr {
    const expr: ParseExpr = new ParseSend(
      new ParseFrame(new ArgsBuilder().key("")),
      new ArgsBuilder()
        .pair(
          "",
          new HandlersArg([
            new OnHandler(new ParamsBuilder().key(""), this.body),
          ])
        )
        .build()
    )
    return expr.compile(scope)
  }
}

export class ParseIf {
  constructor(
    private cond: ParseExpr,
    private ifTrue: ParseStmt[],
    private ifFalse: ParseStmt[]
  ) {}
  compile(scope: Scope): IRExpr {
    return new ParseSend(
      this.cond,
      new ArgsBuilder()
        .pair(
          "",
          new HandlersArg([
            new OnHandler(new ParamsBuilder().key("true"), this.ifTrue),
            new OnHandler(new ParamsBuilder().key("false"), this.ifFalse),
          ])
        )
        .build()
    ).compile(scope)
  }
}

export class OnHandler implements ParseHandler {
  constructor(private params: ParseParams, private body: ParseStmt[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    selfBinding: ParseBinding | undefined
  ): void {
    return this.params.addToClass(instance, cls, this.body, selfBinding)
  }
  addToBlockClass(scope: Scope, cls: IRBlockClass): void {
    return this.params.addToBlockClass(scope, cls, this.body)
  }
}

export class ElseHandler implements ParseHandler {
  constructor(private body: ParseStmt[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    selfBinding: ParseBinding | undefined
  ): void {
    const scope = new BasicScope(instance, new LocalsImpl())
    cls.addElse([
      ...compileSelfBinding(scope, selfBinding),
      ...this.body.flatMap((s) => s.compile(scope)),
    ])
  }
  addToBlockClass(scope: Scope, cls: IRBlockClass): void {
    cls.addElse(this.body.flatMap((s) => s.compile(scope)))
  }
}

function compileSelfBinding(
  scope: Scope,
  binding: ParseBinding | undefined
): IRStmt[] {
  if (binding && binding.selfBinding) {
    return binding.selfBinding(scope)
  }
  return []
}

function useAs(scope: Scope, as: string | null): ScopeRecord {
  if (as === null) return scope.locals.create("let")
  return useLet(scope, as)
}
function useLet(scope: Scope, key: string): ScopeRecord {
  return scope.locals.set(key, scope.locals.create("let"))
}
