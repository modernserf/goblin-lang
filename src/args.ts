import { ParseIdent } from "./expr"
import { compileSend } from "./compiler"
import {
  InvalidDestructuringError,
  InvalidFrameArgError,
  InvalidLetBindingError,
  InvalidProvideBindingError,
  InvalidVarArgError,
} from "./error"
import { frame } from "./frame"
import {
  ASTBindPair,
  ASTLetBinding,
  IRArg,
  IRExpr,
  IRStmt,
  ParseArg,
  ParseArgs,
  ParseExpr,
  ParseHandler,
  ParsePair,
  Scope,
} from "./interface"
import {
  IRBlockClass,
  IRDoArg,
  IRProvideStmt,
  IRValueArg,
  IRVarArg,
} from "./interpreter"
import { build } from "./message-builder"

export class KeyArgs implements ParseArgs {
  constructor(private key: string) {}
  provide(): IRStmt[] {
    throw new InvalidProvideBindingError()
  }
  send(scope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    return compileSend(scope, this.key, target, [], orElse)
  }
  frame(scope: Scope): IRExpr {
    return frame(this.key, [])
  }
  destructure(): ASTBindPair[] {
    throw new InvalidDestructuringError()
  }
}

export class PairArgs implements ParseArgs {
  constructor(private pairs: ParsePair<ParseArg>[]) {}
  provide(scope: Scope): IRStmt[] {
    return build<ParseArg, { key: string; value: ParseArg }, IRStmt[]>(
      this.pairs,
      {
        punValue(key) {
          return {
            key,
            value: new ValueArg(new ParseIdent(key)),
          }
        },
        pair(key, arg) {
          return { key, value: arg }
        },
        build(_, args) {
          return args.map((arg) => {
            return arg.value.provide(scope, arg.key)
          })
        },
      }
    )
  }
  send(scope: Scope, target: ParseExpr, orElse: ParseExpr | null): IRExpr {
    return build<ParseArg, ParseArg, IRExpr>(this.pairs, {
      punValue(key) {
        return new ValueArg(new ParseIdent(key))
      },
      pair(_, arg) {
        return arg
      },
      build(selector, args) {
        return compileSend(scope, selector, target, args, orElse)
      },
    })
  }
  frame(scope: Scope): IRExpr {
    return build<ParseArg, { key: string; value: ParseExpr }, IRExpr>(
      this.pairs,
      {
        punValue(key) {
          return { key, value: new ParseIdent(key) }
        },
        pair(key, arg) {
          if (!arg.frameArg) throw new InvalidFrameArgError()
          return { key, value: arg.frameArg() }
        },
        build(selector, args) {
          return frame(
            selector,
            args.map((arg) => ({
              key: arg.key,
              value: arg.value.compile(scope),
            }))
          )
        },
      }
    )
  }
  destructure(): ASTBindPair[] {
    return this.pairs.map((item) => {
      switch (item.tag) {
        case "punPair":
          return {
            key: item.key,
            value: { tag: "identifier", value: item.key },
          }
        case "pair":
          if (!item.value.destructureArg) throw new InvalidDestructuringError()
          return {
            key: item.key,
            value: item.value.destructureArg(),
          }
      }
    })
  }
}

export class ValueArg implements ParseArg {
  constructor(private expr: ParseExpr) {}
  sendArg(scope: Scope): IRArg {
    return new IRValueArg(this.expr.compile(scope))
  }
  frameArg(): ParseExpr {
    return this.expr
  }
  destructureArg(): ASTLetBinding {
    return letBinding(this.expr)
  }
  provide(scope: Scope, key: string): IRStmt {
    return new IRProvideStmt(key, this.expr.compile(scope))
  }
}

export class VarArg implements ParseArg {
  constructor(private binding: ParseExpr) {}
  sendArg(scope: Scope): IRArg {
    if (!this.binding.simpleBinding) throw new InvalidVarArgError()
    return new IRVarArg(
      scope.lookupVarIndex(this.binding.simpleBinding().value)
    )
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide var"
  }
}

export class HandlersArg implements ParseArg {
  constructor(private handlers: ParseHandler[]) {}
  sendArg(scope: Scope): IRArg {
    const cls = new IRBlockClass()
    for (const handler of this.handlers.flatMap((h) => h.expand())) {
      handler.addToBlockClass(scope, cls)
    }
    return new IRDoArg(cls)
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide handler"
  }
}

function letBinding(value: ParseExpr): ASTLetBinding {
  if (!value.letBinding) throw new InvalidLetBindingError()
  return value.letBinding()
}
