import { HandlersArg, KeyArgs, PairArgs, ValueArg } from "./args"
import { compileLet, compileObject, compileSend } from "./compiler"
import {
  DuplicateElseHandlerError,
  InvalidFrameArgError,
  InvalidImportBindingError,
  InvalidLetBindingError,
  InvalidSetTargetError,
} from "./error"
import {
  ASTHandler,
  ASTLetBinding,
  ASTSimpleBinding,
  HandlerSet,
  IRExpr,
  IRStmt,
  ParseArgs,
  ParseExpr,
  ParseHandler,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import { IRBlockClass, IRModuleExpr, PrimitiveValue, unit } from "./interpreter"
import { KeyParams } from "./params"
import { floatClass, intClass, stringClass } from "./primitive"
import { BasicScope } from "./scope"
import { ExprStmt } from "./stmt"

function handlerSet(ins: ParseHandler[]): HandlerSet {
  const out: HandlerSet = {
    tag: "object",
    handlers: new Map<string, ASTHandler>(),
    else: null,
  }
  for (const handler of ins.flatMap((x) => x.expand())) {
    handler.addToSet(out)
  }

  return out
}

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

export class ParseIdent implements ParseExpr {
  constructor(private value: string) {}
  compile(scope: Scope): IRExpr {
    return scope.lookup(this.value)
  }
  simpleBinding(): ASTSimpleBinding {
    return { tag: "identifier", value: this.value }
  }
  letBinding(): ASTLetBinding {
    return { tag: "identifier", value: this.value }
  }
  setInPlace(): ASTSimpleBinding {
    return this.simpleBinding()
  }
}

export class ParseParens implements ParseExpr {
  constructor(private expr: ParseExpr) {}
  compile(scope: Scope, selfBinding?: string | undefined): IRExpr {
    return this.expr.compile(scope)
  }
}

export class ParseObject implements ParseExpr {
  constructor(private handlers: ParseHandler[]) {}
  compile(scope: Scope, selfBinding?: string | undefined): IRExpr {
    const hs = handlerSet(this.handlers)
    return compileObject(hs, scope, selfBinding)
  }
}

export class ParseFrame implements ParseExpr {
  constructor(private args: ParseArgs, private as: ParseExpr | null) {}
  compile(scope: Scope): IRExpr {
    if (this.as) throw new InvalidFrameArgError()
    return this.args.frame(scope)
  }
  letBinding(): ASTLetBinding {
    if (this.as) {
      if (!this.as.simpleBinding) throw new InvalidLetBindingError()
      return {
        tag: "object",
        params: this.args.destructure(),
        as: this.as.simpleBinding().value,
      }
    }
    return {
      tag: "object",
      params: this.args.destructure(),
      as: null,
    }
  }
  importBinding(scope: Scope, source: IRExpr): IRStmt[] {
    if (this.as) throw new InvalidImportBindingError()
    return compileLet(
      scope,
      {
        tag: "object",
        params: this.args.destructure(),
        as: null,
      },
      source
    )
  }
}

export class ParseSend implements ParseExpr {
  constructor(private target: ParseExpr, private args: ParseArgs) {}
  compile(scope: Scope): IRExpr {
    return this.args.send(scope, this.target, null)
  }
  setInPlace(): ASTSimpleBinding {
    if (!this.target.setInPlace) throw new InvalidSetTargetError()
    return this.target.setInPlace()
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
    return compileSend(scope, this.operator, this.target, [])
  }
}

export class ParseBinaryOp implements ParseExpr {
  constructor(
    private target: ParseExpr,
    private operator: string,
    private operand: ParseExpr
  ) {}
  compile(scope: Scope): IRExpr {
    return compileSend(scope, `${this.operator}:`, this.target, [
      new ValueArg(this.operand),
    ])
  }
}

export class ParseDoBlock implements ParseExpr {
  constructor(private body: ParseStmt[]) {}
  compile(scope: Scope): IRExpr {
    const expr: ParseExpr = new ParseSend(
      new ParseFrame(new KeyArgs(""), null),
      new PairArgs([
        {
          tag: "pair",
          key: "",
          value: new HandlersArg([new OnHandler(new KeyParams(""), this.body)]),
        },
      ])
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
        new PairArgs([
          {
            tag: "pair",
            key: "",
            value: new HandlersArg([
              new OnHandler(new KeyParams("true"), trueBlock),
              new OnHandler(new KeyParams("false"), falseBlock),
            ]),
          },
        ])
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
  addToSet(out: HandlerSet): void {
    this.params.addToSet(out, this.body)
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
  addToSet(handlerSet: HandlerSet): void {
    if (handlerSet.else) throw new DuplicateElseHandlerError()
    handlerSet.else = {
      selector: "",
      params: [],
      body: this.body,
    }
  }
  addToBlockClass(scope: Scope, cls: IRBlockClass): void {
    cls.addElse(this.body.flatMap((s) => s.compile(scope)))
  }
}
