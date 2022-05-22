import { Token } from "./lexer"

export type Expr =
  | { tag: "number"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "clusterIdent"; value: string }
  | { tag: "frame"; value: FrameValue }
  | { tag: "call"; receiver: Expr; value: CallValue; block: Block | null }
  | { tag: "opCall"; receiver: Expr; args: OpArg[] }

type FrameValue =
  | { tag: "tag"; value: string }
  | { tag: "entries"; value: FrameEntry[] }

type FrameEntry =
  | { tag: "field"; key: string; value: Expr }
  | { tag: "method"; value: MethodValue; body: Statement[] }

type CallValue =
  | { tag: "tag"; value: string }
  | { tag: "args"; args: { key: string; value: Expr }[] }

type Block = { params: Binding[]; body: Statement[] }

type OpArg =
  | { tag: "expr"; expr: Expr }
  | { tag: "operator"; operator: string }
  | { tag: "group"; args: OpArg[] }

export type Statement =
  | { tag: "let"; binding: Binding; type: TypeExpr | null; expr: Expr }
  | { tag: "set"; target: string; expr: Expr }
  | { tag: "return"; expr: Expr }
  | { tag: "expr"; expr: Expr }

export type Declaration =
  | { tag: "cluster"; name: string; body: Declaration[] }
  | { tag: "struct"; params: CallParam[] }
  | {
      tag: "method"
      receiver: MethodReceiver
      value: MethodValue
      body: Statement[]
    }

type MethodReceiver = "cluster" | "instance"

type MethodValue =
  | { tag: "tag"; value: string }
  | { tag: "params"; value: CallParam[] }

type CallParam = {
  name: string
  binding: Binding
  type: TypeExpr
  typeAlias: string | null
}

export type Binding =
  | { tag: "identifier"; value: string }
  | { tag: "frame"; value: FrameBindingEntry[] }

type FrameBindingEntry =
  | { tag: "key"; key: string; binding: Binding }
  | { tag: "call"; value: CallValue; binding: Binding }

export type TypeExpr =
  | { tag: "cluster"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "frame"; value: { key: string; typeExpr: TypeExpr }[] }

export class ParseError {
  constructor(public expected: string, public received: Token) {}
}

export class Parser {
  private token!: Token
  private iterator: Iterator<Token>
  constructor(tokens: Iterable<Token>) {
    this.iterator = tokens[Symbol.iterator]()
    this.advance()
  }
  advance() {
    this.token = this.iterator.next().value
  }

  expect<T>(value: T | null, expected: string): T {
    if (value === null) {
      throw new ParseError(expected, this.token)
    }
    return value
  }
  accept<Tag extends Token["tag"]>(tag: Tag): (Token & { tag: Tag }) | null {
    const tok = this.token
    if (tok.tag === tag) {
      this.advance()
      return tok as Token & { tag: Tag }
    }
    return null
  }
  mustAccept<Tag extends Token["tag"]>(tag: Tag): Token & { tag: Tag } {
    return this.expect(this.accept(tag), tag)
  }
  keyword(name: string): boolean {
    if (this.token.tag === "keyword" && this.token.value === name) {
      this.advance()
      return true
    }
    return false
  }
  binding(): Binding | null {
    const tok = this.token
    switch (tok.tag) {
      case "identifier":
        this.advance()
        return { tag: "identifier", value: tok.value }
      case "[":
        return this.frameBinding()
      default:
        return null
    }
  }
  frameBinding(): Binding {
    const entries: FrameBindingEntry[] = []
    this.mustAccept("[")
    const tok = this.token
    while (!this.accept("]")) {
      switch (tok.tag) {
        case "identifier":
          this.advance()
          entries.push({
            tag: "key",
            key: tok.value,
            binding: { tag: "identifier", value: tok.value },
          })
          continue
        case "keyword": {
          const key = this.mustKeyString()
          this.mustAccept(":")
          const binding = this.expect(this.binding(), "binding")
          entries.push({ tag: "key", key, binding })
          continue
        }
        case "{": {
          const value = this.callArgs()
          this.mustAccept(":")
          const binding = this.expect(this.binding(), "binding")
          entries.push({ tag: "call", value, binding })
        }
      }
    }
    return { tag: "frame", value: entries }
  }

  typeExpr(): TypeExpr | null {
    const tok = this.token
    switch (tok.tag) {
      case "cluster":
        this.advance()
        return { tag: "cluster", value: tok.value }
      case "identifier":
        this.advance()
        return { tag: "identifier", value: tok.value }
      case "[":
        return this.frameTypeExpr()
      default:
        return null
    }
  }
  frameTypeExpr(): TypeExpr {
    this.mustAccept("[")
    const entries = []
    while (!this.accept("]")) {
      const key = this.mustKeyString()
      this.mustAccept(":")
      const typeExpr = this.expect(this.typeExpr(), "type expr")
      entries.push({ key, typeExpr })
    }
    return { tag: "frame", value: entries }
  }

  statement(): Statement | null {
    const tok = this.token
    if (tok.tag === "keyword") {
      switch (tok.value) {
        case "let": {
          this.advance()
          const binding = this.expect(this.binding(), "binding")
          const type = this.accept(":") ? this.typeExpr() : null
          this.mustAccept(":=")
          const expr = this.mustExpr()
          return { tag: "let", binding, expr, type }
        }
        case "set": {
          this.advance()
          if (this.token.tag !== "identifier") {
            throw new ParseError("identifier", this.token)
          }
          const target = this.token.value
          const expr = this.mustExpr()
          if (expr.tag === "identifier") {
            // set _x_ := 1
            this.mustAccept(":=")
            const expr = this.mustExpr()
            return { tag: "set", target, expr }
          } else {
            // set _x_{foo: 1}
            return { tag: "set", target, expr }
          }
        }
        case "return": {
          this.advance()
          const expr = this.mustExpr()
          return { tag: "return", expr }
        }
        default: {
          throw new ParseError("statement", tok)
        }
      }
    }
    const expr = this.expr()
    return expr ? { tag: "expr", expr } : null
  }
  mustExpr(): Expr {
    return this.expect(this.expr(), "expr")
  }
  expr(): Expr | null {
    let expr = this.baseExpr()
    if (!expr) return null
    while (true) {
      const tok = this.token
      switch (tok.tag) {
        case "{":
          const value = this.callArgs()
          const block = this.block()
          expr = { tag: "call", receiver: expr, value, block }
          break
        case "(":
          const args = this.opArgs()
          expr = { tag: "opCall", receiver: expr, args }
          break
      }
    }
  }

  // do (foo bar) foo{baz: bar} end
  block(): Block | null {
    if (!this.keyword("do")) return null
    const params = []
    if (this.accept("(")) {
      while (!this.accept(")")) {
        params.push(this.expect(this.binding(), "binding"))
      }
    }

    const body = []
    while (!this.keyword("end")) {
      body.push(this.expect(this.statement(), "statement"))
    }
    return { params, body }
  }

  opArgs(): OpArg[] {
    const args: OpArg[] = []
    this.mustAccept("(")
    while (!this.accept(")")) {
      switch (this.token.tag) {
        case "operator":
          args.push({ tag: "operator", operator: this.token.value })
          this.advance()
          continue
        case "(":
          args.push({ tag: "group", args: this.opArgs() })
          continue
        default:
          const expr = this.mustExpr()
          args.push({ tag: "expr", expr })
      }
    }
    return args
  }

  baseExpr(): Expr | null {
    const tok = this.token
    switch (tok.tag) {
      case "number":
        this.advance()
        return { tag: "number", value: Number(tok.value) }
      case "string":
        this.advance()
        return { tag: "string", value: tok.value }
      case "identifier":
        this.advance()
        return { tag: "identifier", value: tok.value }
      case "cluster":
        this.advance()
        return { tag: "clusterIdent", value: tok.value }
      case "[":
        return this.frame()
      default:
        return null
    }
  }
  callArgs(): CallValue {
    this.mustAccept("{")
    const args = []
    // get tag or first pair
    const keyString = this.mustKeyString()
    if (this.accept("}")) {
      return { tag: "tag", value: keyString }
    }
    this.mustAccept(":")
    const value = this.mustExpr()
    args.push({ key: keyString, value })

    while (!this.accept("}")) {
      const key = this.mustKeyString()
      this.mustAccept(":")
      const value = this.mustExpr()
      args.push({ key, value })
    }
    return { tag: "args", args }
  }
  frame(): Expr {
    this.mustAccept("[")
    const entries: FrameEntry[] = []
    // get tag or first field pair
    const keyString = this.keyString()
    if (keyString) {
      if (this.accept("]")) {
        return { tag: "frame", value: { tag: "tag", value: keyString } }
      }
      this.mustAccept(":")
      const value = this.mustExpr()
      entries.push({ tag: "field", key: keyString, value })
    }

    while (!this.accept("]")) {
      const keyString = this.keyString()
      if (keyString) {
        this.mustAccept(":")
        const value = this.mustExpr()
        entries.push({ tag: "field", key: keyString, value })
        continue
      }
      const methodValue = this.expect(this.methodValue(), "method or field")
      this.expect(this.keyword("is"), "is")
      const body = this.body()
      entries.push({ tag: "method", value: methodValue, body })
    }
    return { tag: "frame", value: { tag: "entries", value: entries } }
  }
  mustKeyString(): string {
    return this.expect(this.keyString(), "keystring")
  }
  keyString(): string | null {
    const strs = []
    while (true) {
      switch (this.token.tag) {
        case "keyword":
        case "operator":
          strs.push(this.token.value)
          this.advance()
          continue
        default:
          if (strs.length === 0) return null
          return strs.join("")
      }
    }
  }
  methodValue(): MethodValue {
    this.mustAccept("{")
    const params = []
    const keyString = this.mustKeyString()
    if (this.accept("}")) {
      return { tag: "tag", value: keyString }
    }
    params.push(this.callParam(keyString))

    while (!this.accept("}")) {
      params.push(this.callParam(this.mustKeyString()))
    }

    return { tag: "params", value: params }
  }
  callParam(keyString: string): CallParam {
    const binding = this.binding()
    this.mustAccept(":")
    const typeExpr = this.expect(this.typeExpr(), "type expr")
    const typeAlias = this.accept("identifier")
    return {
      name: keyString,
      binding: binding || { tag: "identifier", value: keyString },
      type: typeExpr,
      typeAlias: typeAlias ? typeAlias.value : null,
    }
  }

  body(): Statement[] {
    const out = []
    let res
    while ((res = this.statement())) {
      out.push(res)
    }
    return out
  }
}
