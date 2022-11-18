import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import {
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  ASTLetBinding,
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
  IRBlockClass,
  IRClass,
  IRLocalExpr,
  IRModuleExpr,
  IRSendExpr,
  PrimitiveValue,
  unit,
} from "./interpreter"
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
  letBinding(): ASTLetBinding {
    return { tag: "identifier", value: this.value }
  }
  var(scope: Scope, expr: ParseExpr): IRStmt[] {
    const value = expr.compile(scope)
    const record = scope.locals.set(this.value, scope.locals.create("var"))
    return [new IRAssignStmt(record.index, value)]
  }
  let(scope: Scope, value: IRExpr): IRStmt[] {
    return compileLet(scope, { tag: "identifier", value: this.value }, value)
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
  letBinding(): ASTLetBinding {
    return {
      tag: "object",
      params: this.params.destructure(),
      as: this.as,
    }
  }
  let(scope: Scope, value: IRExpr): IRStmt[] {
    return compileLet(scope, this.letBinding(), value)
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    if (this.as) throw new InvalidImportBindingError()
    return this.params.import(scope, source)
  }
  var(scope: Scope, expr: ParseExpr): IRStmt[] {
    throw new InvalidVarBindingError()
  }
  set(scope: Scope, expr: ParseExpr): IRStmt[] {
    throw new InvalidSetTargetError()
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
  compile(scope: Scope, selfBinding?: ParseBinding | undefined): IRExpr {
    const cls = new IRClass()
    const instance = new ObjectInstance(scope)
    for (const handler of this.handlers.flatMap((h) => h.expand())) {
      handler.addToClass(instance, cls, selfBinding)
    }
    instance.compileSelfHandlers(cls)
    return constObject(cls, instance.ivars)
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

type ParseCond = { value: ParseExpr; body: ParseStmt[] }

export class ParseIf implements ParseExpr {
  constructor(private conds: ParseCond[], private elseBody: ParseStmt[]) {}
  compile(scope: Scope): IRExpr {
    const res: ParseStmt[] = this.conds.reduceRight((falseBlock, cond) => {
      const trueBlock = cond.body
      const send = new ParseSend(
        cond.value,
        new ArgsBuilder()
          .pair(
            "",
            new HandlersArg([
              new OnHandler(new ParamsBuilder().key("true"), trueBlock),
              new OnHandler(new ParamsBuilder().key("false"), falseBlock),
            ])
          )
          .build()
      )

      return [new ExprStmt(send)]
    }, this.elseBody)
    if (res[0] && res[0].unwrap) {
      return res[0].unwrap().compile(scope)
    }
    throw new Error("unreachable")
  }
}

export class OnHandler implements ParseHandler {
  constructor(private params: ParseParams, private body: ParseStmt[]) {}
  expand(): ParseHandler[] {
    return this.params.expand(this.body)
  }
  addToClass(
    instance: Instance,
    cls: IRClass,
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
  expand(): ParseHandler[] {
    return [this]
  }
  addToClass(
    instance: Instance,
    cls: IRClass,
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

function compileLet(
  scope: Scope,
  binding: ASTLetBinding,
  value: IRExpr
): IRStmt[] {
  switch (binding.tag) {
    case "identifier": {
      const record = useLet(scope, binding.value)
      return [new IRAssignStmt(record.index, value)]
    }
    case "object":
      const record = useAs(scope, binding.as)
      return [
        new IRAssignStmt(record.index, value),
        ...binding.params.flatMap((param) =>
          compileLet(scope, param.value, new IRSendExpr(param.key, value, []))
        ),
      ]
  }
}
