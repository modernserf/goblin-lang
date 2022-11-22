import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import {
  InvalidImportBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  IHandlerBuilder,
  Instance,
  IRExpr,
  IRHandler,
  IRStmt,
  ParamBinding,
  ParseArgs,
  ParseBinding,
  ParseExpr,
  ParseHandler,
  ParseParam,
  ParseParams,
  ParseStmt,
  PartialHandler,
  PartialParseParam,
  Scope,
  ScopeRecord,
} from "./interface"
import { IRAssignStmt } from "./ir-stmt"
import { IRLocalExpr, IRModuleExpr } from "./ir-expr"
import { IRClassBuilder, IRBlockClassBuilder } from "./ir-builder"
import { PrimitiveValue, unit } from "./value"
import { constObject } from "./optimize"
import { ParamsBuilder } from "./params"
import { floatClass, intClass, stringClass } from "./primitive"
import { createInstance } from "./scope"
import {
  elseBlockHandler,
  elseHandler,
  IROnBlockHandler,
  onHandler,
} from "./ir-handler"
import { LetStmt } from "./stmt"

export const Self: ParseExpr = {
  compile(scope) {
    return scope.instance.self()
  },
  getHandler(scope, selector) {
    return scope.instance.getPlaceholderHandler(selector)
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
  getHandler(scope: Scope, selector: string): IRHandler {
    return intClass.get(selector)
  }
}

export class ParseFloat implements ParseExpr {
  constructor(private value: number) {}
  compile(): IRExpr {
    return new PrimitiveValue(floatClass, this.value)
  }
  getHandler(scope: Scope, selector: string): IRHandler {
    return floatClass.get(selector)
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
  getHandler(scope: Scope, selector: string): IRHandler {
    return stringClass.get(selector)
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

export const ParsePlaceholder: ParseBinding = {
  let(scope, value) {
    return []
  },
  import(scope, source) {
    throw new InvalidImportBindingError()
  },
  var() {
    throw new InvalidVarBindingError()
  },
  set() {
    throw new InvalidSetTargetError()
  },
  selfBinding() {
    return []
  },
  export(scope) {
    throw new Error("invalid export")
  },
  handler() {
    return []
  },
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

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding: ParseBinding = ParsePlaceholder): IRExpr {
    const cls = new IRClassBuilder()
    const instance = createInstance(scope)
    for (const handler of this.handlers) {
      handler.addToClass(instance, cls, selfBinding)
    }
    const builtClass = cls.buildAndClosePartials(scope)
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
    return this.args.send().compile(scope, this.target, null)
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
    return this.args.send().compile(scope, this.target, this.orElse)
  }
}

export class ParseUnaryOp implements ParseExpr {
  constructor(private target: ParseExpr, private operator: string) {}
  compile(scope: Scope): IRExpr {
    return new ArgsBuilder()
      .key(this.operator)
      .send()
      .compile(scope, this.target, null)
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
      .send()
      .compile(scope, this.target, null)
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
    selfBinding: ParseBinding
  ): void {
    this.params.addOn(new HandlerBuilder(instance, cls, this.body, selfBinding))
  }
  addToBlockClass(scope: Scope, cls: IRBlockClassBuilder): void {
    this.params.addOn(new BlockHandlerBuilder(scope, cls, this.body))
  }
}

export class ElseHandler implements ParseHandler {
  constructor(private params: ParseParams, private body: ParseStmt[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    selfBinding: ParseBinding
  ): void {
    this.params.addElse(
      new HandlerBuilder(instance, cls, this.body, selfBinding)
    )
  }
  addToBlockClass(scope: Scope, cls: IRBlockClassBuilder): void {
    this.params.addElse(new BlockHandlerBuilder(scope, cls, this.body))
  }
}

function useAs(scope: Scope, as: string | null): ScopeRecord {
  if (as === null) return scope.locals.create("let")
  return useLet(scope, as)
}
function useLet(scope: Scope, key: string): ScopeRecord {
  return scope.locals.set(key, scope.locals.create("let"))
}

class HandlerBuilder implements IHandlerBuilder {
  constructor(
    private instance: Instance,
    private cls: IRClassBuilder,
    private body: ParseStmt[],
    private selfBinding: ParseBinding
  ) {}
  addOn(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[]
  ): void {
    const partial = condParams(params, this.body)
    if (partial) {
      this.cls.addPartial(selector, partial)
    } else {
      const { scope, head } = this.scopeHead(params, bindings)
      this.cls.addFinal(selector, scope, this.body, (body) =>
        onHandler(params, head, body)
      )
    }
  }
  addElse(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[]
  ): void {
    const { scope, head } = this.scopeHead(params, bindings)
    this.cls.addElse(selector, scope, this.body, (body) =>
      elseHandler(
        selector,
        params.map((p) => p.toIR()),
        head.concat(body)
      )
    )
  }
  private scopeHead(params: ParseParam[], bindings: ParamBinding[]) {
    const scope = this.instance.handlerScope(params.length)
    const head = [
      ...this.selfBinding.selfBinding(scope),
      ...params.flatMap((p, i) => p.handler(scope, i)),
      ...bindings.flatMap(({ binding, value }) =>
        new LetStmt(binding, value, false).compile(scope)
      ),
    ]
    return { scope, head }
  }
}

class BlockHandlerBuilder implements IHandlerBuilder {
  private scope = this.inScope.blockBodyScope()
  private paramScope = this.scope.blockParamsScope()
  constructor(
    private inScope: Scope,
    private cls: IRBlockClassBuilder,
    private body: ParseStmt[]
  ) {}
  addOn(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[]
  ): void {
    const partial = condParams(params, this.body)
    if (partial) {
      this.cls.addPartial(selector, partial)
    } else {
      const { offset, head } = this.offsetHead(params, bindings)
      this.cls.addFinal(
        selector,
        this.scope,
        this.body,
        (body) =>
          new IROnBlockHandler(
            offset,
            params.map((p) => p.toIR()),
            head.concat(body)
          )
      )
    }
  }
  addElse(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[]
  ): void {
    const { offset, head } = this.offsetHead(params, bindings)
    this.cls.addElse(selector, this.scope, this.body, (body) =>
      elseBlockHandler(
        selector,
        offset,
        params.map((p) => p.toIR()),
        head.concat(body)
      )
    )
  }
  private offsetHead(params: ParseParam[], bindings: ParamBinding[]) {
    const offset = this.scope.locals.allocate(params.length)
    const head = [
      ...params.flatMap((p, i) => p.handler(this.paramScope, offset + i)),
      ...bindings.flatMap(({ binding, value }) =>
        new LetStmt(binding, value, false).compile(this.scope)
      ),
    ]
    return { offset, head }
  }
}

class ParseLocal implements ParseExpr {
  constructor(private index: number) {}
  compile(): IRExpr {
    return new IRLocalExpr(this.index)
  }
}

function condParams(
  params: ParseParam[],
  body: ParseStmt[]
): PartialHandler | null {
  return params.reduceRight((coll: PartialHandler | null, param, index) => {
    if (!param.cond) return coll
    const p = param as PartialParseParam
    return {
      params,
      cond: (ifFalse) => {
        const ifTrue = coll ? coll.cond(ifFalse) : body
        return p.cond(new ParseLocal(index), ifTrue, ifFalse)
      },
    }
  }, null)
}
