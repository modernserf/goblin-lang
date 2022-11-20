import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import {
  InvalidImportBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  Instance,
  IRExpr,
  IRStmt,
  ParseArgs,
  ParseBinding,
  ParseExpr,
  ParseHandler,
  ParseParams,
  ParseStmt,
  Scope,
  ScopeRecord,
} from "./interface"
import {
  IRAssignStmt,
  IRClassBuilder,
  IRBlockClassBuilder,
  IRLocalExpr,
  IRModuleExpr,
} from "./ir"
import { PrimitiveValue, unit } from "./value"
import { constObject } from "./optimize"
import { ParamsBuilder } from "./params"
import { floatClass, intClass, stringClass } from "./primitive"
import { ObjectInstance } from "./scope"

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

export class ParseParens implements ParseExpr {
  constructor(private expr: ParseExpr) {}
  compile(scope: Scope): IRExpr {
    return this.expr.compile(scope)
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding: ParseBinding = ParsePlaceholder): IRExpr {
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
    selfBinding: ParseBinding
  ): void {
    this.params.addToClass(instance, cls, this.body, selfBinding)
  }
  addToBlockClass(scope: Scope, cls: IRBlockClassBuilder): void {
    return this.params.addToBlockClass(scope, cls, this.body)
  }
}

export class ElseHandler implements ParseHandler {
  constructor(private params: ParseParams, private body: ParseStmt[]) {}
  addToClass(
    instance: Instance,
    cls: IRClassBuilder,
    selfBinding: ParseBinding
  ): void {
    this.params.addElseToClass(instance, cls, this.body, selfBinding)
  }
  addToBlockClass(scope: Scope, cls: IRBlockClassBuilder): void {
    cls.addElse(this.body.flatMap((s) => s.compile(scope)))
  }
}

function useAs(scope: Scope, as: string | null): ScopeRecord {
  if (as === null) return scope.locals.create("let")
  return useLet(scope, as)
}
function useLet(scope: Scope, key: string): ScopeRecord {
  return scope.locals.set(key, scope.locals.create("let"))
}
