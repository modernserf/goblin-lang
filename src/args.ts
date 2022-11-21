import { ParseIdent } from "./expr"
import { InvalidFrameArgError, InvalidProvideBindingError } from "./error"
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
import { IRProvideStmt } from "./ir-stmt"
import { IRDoArg, IRValueArg, IRVarArg } from "./ir-handler"
import { IRBlockClassBuilder, IRSendBuilder } from "./ir-builder"
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
  send(): IRSendBuilder {
    // return compileSend(scope, this.key, target, [], orElse)
    return new IRSendBuilder(this.key, [])
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
  send(): IRSendBuilder {
    return build<ParseArg, ParseArg, IRSendBuilder>(this.pairs, {
      pair(_, arg) {
        return arg
      },
      build(selector, args) {
        return new IRSendBuilder(selector, args)
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
