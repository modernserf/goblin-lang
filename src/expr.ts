import { ArgsBuilder, HandlersArg, ValueArg } from "./args"
import { InvalidSetTargetError } from "./error"
import {
  IRExpr,
  IRHandler,
  IRStmt,
  ParseArgs,
  ParseBinding,
  ParseExpr,
  ParseHandler,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import { IRAssignStmt } from "./ir-stmt"
import { IRModuleExpr } from "./ir-expr"
import { PrimitiveValue, unit } from "./value"
import { constObject } from "./optimize"
import { ParamsBuilder } from "./params"
import { floatClass, intClass, stringClass } from "./primitive"
import { createInstance } from "./scope"
import { HandlerBuilder } from "./ir-handler"
import { ParseBindIdent, ParsePlaceholder } from "./binding"

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

export class ParseIdent implements ParseExpr {
  constructor(private value: string) {}
  compile(scope: Scope): IRExpr {
    return scope.lookup(this.value)
  }
  setInPlace(scope: Scope, expr: ParseExpr): IRStmt[] {
    if (expr === this) throw new InvalidSetTargetError()
    const value = expr.compile(scope)
    return [new IRAssignStmt(scope.lookupVarIndex(this.value), value)]
  }
  asSetBinding(): ParseBinding {
    return new ParseBindIdent(this.value)
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding: ParseBinding = ParsePlaceholder): IRExpr {
    const instance = createInstance(scope)
    const builder = new HandlerBuilder(instance, selfBinding)
    for (const handler of this.handlers) {
      handler.addToClass(builder)
    }
    const builtClass = builder.build(scope)
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
  addToClass(builder: HandlerBuilder): void {
    this.params.addOn(builder, this.body)
  }
  addToBlockClass(builder: HandlerBuilder): void {
    this.params.addOn(builder, this.body)
  }
}

export class ElseHandler implements ParseHandler {
  constructor(private params: ParseParams, private body: ParseStmt[]) {}
  addToClass(builder: HandlerBuilder): void {
    this.params.addElse(builder, this.body)
  }
  addToBlockClass(builder: HandlerBuilder): void {
    this.params.addElse(builder, this.body)
  }
}
