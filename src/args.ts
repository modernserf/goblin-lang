import { ParseIdent, Self } from "./expr"
import {
  InvalidFrameArgError,
  InvalidProvideBindingError,
  RedundantTrySendError,
} from "./error"
import { frame } from "./frame"
import {
  IRArg,
  IRExpr,
  IRStmt,
  ParseArg,
  ParseArgs,
  ParseExpr,
  ParseHandler,
  PatternBuilder,
  Scope,
} from "./interface"
import {
  IRBlockClassBuilder,
  IRDoArg,
  IRProvideStmt,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
  IRTrySendExpr,
  IRValueArg,
  IRVarArg,
} from "./ir"
import { SendScope } from "./scope"
import { build } from "./message-builder"

export class InvalidArgsError {}

type Pair = { key: string; value: ParseArg }

export class ArgsBuilder implements PatternBuilder<ParseArg, ParseArgs> {
  private pairs: Pair[] = []
  key(key: string): ParseArgs {
    // TODO: maybe `return new InvalidArgs(key, this.pairs)`
    if (this.pairs.length) throw new InvalidArgsError()
    return new KeyArgs(key)
  }
  punPair(key: string): this {
    this.pairs.push({ key, value: new ValueArg(new ParseIdent(key)) })
    return this
  }
  pair(key: string, value: ParseArg): this {
    this.pairs.push({ key, value })
    return this
  }
  build(): ParseArgs {
    return new PairArgs(this.pairs)
  }
}

class KeyArgs implements ParseArgs {
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
}

class PairArgs implements ParseArgs {
  constructor(private pairs: Pair[]) {}
  provide(scope: Scope): IRStmt[] {
    return build<ParseArg, { key: string; value: ParseArg }, IRStmt[]>(
      this.pairs,
      {
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
        pair(key, arg) {
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
}

export class ValueArg implements ParseArg {
  constructor(private expr: ParseExpr) {}
  sendArg(scope: Scope): IRArg {
    return new IRValueArg(this.expr.compile(scope))
  }
  frameArg(): ParseExpr {
    return this.expr
  }
  provide(scope: Scope, key: string): IRStmt {
    return new IRProvideStmt(key, this.expr.compile(scope))
  }
}

export class VarArg implements ParseArg {
  constructor(private key: string) {}
  sendArg(scope: Scope): IRArg {
    return new IRVarArg(scope.lookupVarIndex(this.key))
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide var"
  }
  frameArg(): ParseExpr {
    throw new InvalidFrameArgError()
  }
}

export class HandlersArg implements ParseArg {
  constructor(private handlers: ParseHandler[]) {}
  sendArg(scope: Scope): IRArg {
    const cls = new IRBlockClassBuilder()
    for (const handler of this.handlers) {
      handler.addToBlockClass(scope, cls)
    }
    return new IRDoArg(cls.build())
  }
  provide(scope: Scope, key: string): IRStmt {
    throw "todo: provide handler"
  }
  frameArg(): ParseExpr {
    throw new InvalidFrameArgError()
  }
}

function compileSend(
  inScope: Scope,
  selector: string,
  target: ParseExpr,
  astArgs: ParseArg[],
  orElse: ParseExpr | null
) {
  const scope = new SendScope(inScope.instance, inScope.locals)

  const irArgs = astArgs.map((v) => v.sendArg(scope))
  if (target === Self) {
    const handler = scope.instance.getPlaceholderHandler(selector)
    if (orElse) {
      // TODO: make this a "warning" rather than an "error"
      throw new RedundantTrySendError()
    }
    return new IRSendDirectExpr(handler, new IRSelfExpr(), irArgs)
  } else {
    if (orElse) {
      return new IRTrySendExpr(
        selector,
        target.compile(scope),
        irArgs,
        orElse.compile(scope)
      )
    } else {
      return new IRSendExpr(selector, target.compile(scope), irArgs)
    }
  }
}
