export type ParseStmt =
  | { tag: "let"; binding: ParseExpr; value: ParseExpr; export: boolean }
  | { tag: "set"; binding: ParseExpr; value: ParseExpr }
  | { tag: "setInPlace"; binding: ParseExpr }
  | { tag: "var"; binding: ParseExpr; value: ParseExpr }
  | { tag: "import"; binding: ParseExpr; value: ParseExpr }
  | { tag: "provide"; message: ParseMessage<ParseArg> }
  | { tag: "using"; message: ParseMessage<ParseParam> }
  | { tag: "return"; value: ParseExpr }
  | { tag: "defer"; body: ParseStmt[] }
  | { tag: "expr"; value: ParseExpr }

// used for both ast exprs and bindings
export type ParseExpr =
  | { tag: "self" }
  | { tag: "unit" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "parens"; value: ParseExpr }
  | { tag: "object"; handlers: ParseHandler[] }
  | { tag: "frame"; message: ParseMessage<ParseArg>; as: ParseExpr | null }
  | { tag: "send"; target: ParseExpr; message: ParseMessage<ParseArg> }
  | { tag: "do"; body: ParseStmt[] }
  | { tag: "if"; conds: ParseCond[]; else: ParseStmt[] }
  | { tag: "unaryOp"; target: ParseExpr; operator: string }
  | { tag: "binaryOp"; target: ParseExpr; arg: ParseExpr; operator: string }

type ParseCond = { value: ParseExpr; body: ParseStmt[] }

export type ParseMessage<T> =
  | { tag: "key"; key: string }
  | { tag: "pairs"; pairs: ParsePair<T>[] }
export type ParsePair<T> =
  | { tag: "pair"; key: string; value: T }
  | { tag: "punPair"; key: string }

export class InvalidVarParamError {}
export class InvalidDoParamError {}
export class InvalidVarArgError {}
export class DuplicateHandlerError {
  constructor(readonly selector: string) {}
}
export class DuplicateElseHandlerError {}
export class DuplicateKeyError {
  constructor(readonly key: string) {}
}

export interface ParseHandler {
  expand(): ParseHandler[]
  addToSet(ast: any, handlerSet: HandlerSet): void
}

type ParamWithBindings = {
  pairs: ParsePair<ParseParam>[]
  bindings: { binding: ParseExpr; value: ParseExpr }[]
}
function expandDefaultParams(
  pairs: ParsePair<ParseParam>[]
): ParamWithBindings[] {
  const out: ParamWithBindings[] = [{ pairs: [], bindings: [] }]
  for (const pair of pairs) {
    if (pair.tag === "pair" && pair.value.defaultPair) {
      const copy = out.map((x) => ({
        pairs: x.pairs.slice(),
        bindings: x.bindings.slice(),
      }))
      for (const item of out) {
        item.pairs.push(pair)
      }
      for (const item of copy) {
        item.bindings.push(pair.value.defaultPair())
      }
      out.push(...copy)
    } else {
      for (const item of out) {
        item.pairs.push(pair)
      }
    }
  }
  return out
}

export class OnHandler implements ParseHandler {
  constructor(
    private message: ParseMessage<ParseParam>,
    private body: ParseStmt[]
  ) {}
  expand(): ParseHandler[] {
    if (this.message.tag === "key") return [this]
    const out: ParseHandler[] = []
    for (const { pairs, bindings } of expandDefaultParams(this.message.pairs)) {
      const body: ParseStmt[] = bindings.map(({ binding, value }) => {
        return { tag: "let", binding, value, export: false }
      })
      body.push(...this.body)
      out.push(new OnHandler({ tag: "pairs", pairs }, body))
    }
    return out
  }
  addToSet(ast: any, out: HandlerSet): void {
    const body = this.body.map((s) => ast.stmt(s))
    const m = build<ParseParam, ASTParam, ASTHandler>(this.message, {
      key(selector) {
        return { selector, params: [], body }
      },
      punValue(value) {
        return { tag: "binding", binding: { tag: "identifier", value } }
      },
      pair(_, param) {
        return param.toAST(ast)
      },
      build(selector, params) {
        return { selector, params, body }
      },
    })
    if (out.handlers.has(m.selector)) {
      throw new DuplicateHandlerError(m.selector)
    }
    out.handlers.set(m.selector, m)
  }
}
export class ElseHandler implements ParseHandler {
  constructor(private body: ParseStmt[]) {}
  expand(): ParseHandler[] {
    return [this]
  }
  addToSet(ast: any, handlerSet: HandlerSet): void {
    if (handlerSet.else) throw new DuplicateElseHandlerError()
    handlerSet.else = {
      selector: "",
      params: [],
      body: this.body.map((s) => ast.stmt(s)),
    }
  }
}

// TODO: eliminate toAST step, compile directly
export interface ParseParam {
  toAST(ast: any): ASTParam
  defaultPair?(): { binding: ParseExpr; value: ParseExpr }
}

export class DefaultValueParam implements ParseParam {
  constructor(private binding: ParseExpr, private defaultValue: ParseExpr) {}
  toAST(ast: any): ASTParam {
    return { tag: "binding", binding: ast.letBinding(this.binding) }
  }
  defaultPair(): { binding: ParseExpr; value: ParseExpr } {
    return { binding: this.binding, value: this.defaultValue }
  }
}

export class ValueParam implements ParseParam {
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    // TODO: is anything done with defaultValue here?
    return { tag: "binding", binding: ast.letBinding(this.value) }
  }
}

export class VarParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    if (this.value.tag !== "identifier") throw new InvalidVarParamError()
    return { tag: "var", binding: this.value }
  }
}

export class DoParam implements ParseParam {
  readonly defaultValue = null
  constructor(private value: ParseExpr) {}
  toAST(ast: any): ASTParam {
    if (this.value.tag !== "identifier") throw new InvalidDoParamError()
    return { tag: "do", binding: this.value }
  }
}

export class PatternParam implements ParseParam {
  readonly defaultValue = null
  constructor(private message: ParseMessage<ParseParam>) {}
  toAST(ast: any): ASTParam {
    throw "todo: pattern param"
  }
}

export interface ParseArg {
  toAst(ast: any): ASTArg
  frameArg?(ast: any): ASTExpr
  destructureArg?(ast: any): ASTLetBinding
}

export class ValueArg implements ParseArg {
  constructor(private expr: ParseExpr) {}
  toAst(ast: any): ASTArg {
    return { tag: "expr", value: ast.expr(this.expr) }
  }
  frameArg(ast: any): ASTExpr {
    return ast.expr(this.expr)
  }
  destructureArg(ast: any): ASTLetBinding {
    return ast.letBinding(this.expr)
  }
}

export class VarArg implements ParseArg {
  constructor(private binding: ParseExpr) {}
  toAst(ast: any): ASTArg {
    if (this.binding.tag !== "identifier") throw new InvalidVarArgError()
    return { tag: "var", value: this.binding }
  }
}

export class HandlersArg implements ParseArg {
  constructor(private handlers: ParseHandler[]) {}
  toAst(ast: any): ASTArg {
    return { tag: "do", value: ast.handlerSet(this.handlers) }
  }
}

export type ASTStmt =
  | { tag: "let"; binding: ASTLetBinding; value: ASTExpr; export: boolean }
  | { tag: "set"; binding: ASTSetBinding; value: ASTExpr }
  | { tag: "var"; binding: ASTVarBinding; value: ASTExpr }
  | { tag: "provide"; args: ASTProvidePair[] }
  | { tag: "using"; params: ASTUsingPair[] }
  | { tag: "import"; binding: ASTImportBinding; source: ASTImportSource }
  | { tag: "return"; value: ASTExpr }
  | { tag: "defer"; body: ASTStmt[] }
  | { tag: "expr"; value: ASTExpr }

export type ASTProvidePair = { key: string; value: ASTArg }
export type ASTUsingPair = { key: string; value: ASTParam }
export type ASTBindPair = { key: string; value: ASTLetBinding }
export type ASTLetBinding =
  | { tag: "identifier"; value: string }
  | { tag: "object"; params: ASTBindPair[]; as: string | null }
export type ASTSetBinding = { tag: "identifier"; value: string } // TODO: `set` paths
export type ASTVarBinding = { tag: "identifier"; value: string }
export type ASTProvideBinding = { tag: "identifier"; value: string }
export type ASTImportBinding = {
  tag: "object"
  params: ASTBindPair[]
  as: null
}
export type ASTImportSource = { tag: "string"; value: string }

export type ASTExpr =
  | { tag: "self" }
  | { tag: "unit" }
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "send"; target: ASTExpr; selector: string; args: ASTArg[] }
  | { tag: "frame"; selector: string; args: ASTFrameArg[] }
  | HandlerSet

export type ASTFrameArg = { key: string; value: ASTExpr }
export type ASTArg =
  | { tag: "expr"; value: ASTExpr }
  | { tag: "var"; value: ASTVarArg }
  | { tag: "do"; value: ASTBlockArg }
export type ASTVarArg = { tag: "identifier"; value: string }
export type ASTBlockArg = HandlerSet

export type HandlerSet = {
  tag: "object"
  handlers: Map<string, ASTHandler>
  else: ASTHandler | null
}

export type ASTHandler = {
  selector: string
  params: ASTParam[]
  body: ASTStmt[]
}

export type ASTParam =
  | { tag: "binding"; binding: ASTLetBinding }
  | { tag: "var"; binding: ASTVarParam }
  | { tag: "do"; binding: ASTBlockParam }
export type ASTVarParam = { tag: "identifier"; value: string }
export type ASTBlockParam = { tag: "identifier"; value: string }

interface Builder<In, Item, Container> {
  key(key: string): Container
  punValue(key: string): Item
  pair(key: string, value: In): Item
  build(selector: string, values: Item[]): Container
}

function build<In, Item, Container>(
  message: ParseMessage<In>,
  builder: Builder<In, Item, Container>
): Container {
  if (message.tag === "key") {
    return builder.key(message.key)
  }
  const map = new Map<string, Item>()

  for (const param of message.pairs) {
    if (map.has(param.key)) throw new DuplicateKeyError(param.key)
    switch (param.tag) {
      case "punPair":
        map.set(param.key, builder.punValue(param.key))
        continue
      case "pair":
        map.set(param.key, builder.pair(param.key, param.value))
        continue
    }
  }

  const sortedKeys = Array.from(map.keys()).sort()
  const selector = sortedKeys.map((k) => `${k}:`).join("")
  const values = sortedKeys.map((k) => map.get(k)!)
  return builder.build(selector, values)
}
