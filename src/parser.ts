import { Token } from "./lexer"

export type Expr =
  | { tag: "number"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; name: string }
  | { tag: "clusterIdent"; name: string }
  | { tag: "frameTag"; value: string }
  | { tag: "frameEntries"; entries: FrameEntry[] }
  | { tag: "callTag"; receiver: Expr; value: string }
  | { tag: "callArgs"; receiver: Expr; args: CallArg[] }

type FrameEntry = { tag: "field"; key: string; expr: Expr }
// | { tag: "closure"; params: string[]; body: Statement[]  }
// | {
//     tag: "method"
//     params: MethodParams
//     returnType: TypeExpr
//     body: Statement[]
//   }

type CallArg = { tag: "expr"; key: string; expr: Expr }
// | { tag: "set"; key: string; name: string }
// | { tag: "block"; key: string; block: Block }

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
  done() {
    this.mustAccept("end")
  }

  // keyword(name: string): boolean {
  //   if (this.token.tag === "keyword" && this.token.value === name) {
  //     this.advance()
  //     return true
  //   }
  //   return false
  // }

  mustExpr(): Expr {
    return this.expect(this.expr(), "expr")
  }

  expr(): Expr | null {
    let left = this.callExpr()
    if (!left) return null

    while (true) {
      const op = this.accept("operator")
      if (!op) break
      const right = this.expect(this.callExpr(), "expr")
      left = {
        tag: "callArgs",
        receiver: left,
        args: [{ tag: "expr", key: op.value, expr: right }],
      }
    }
    return left
  }

  callExpr(): Expr | null {
    let expr = this.baseExpr()
    if (!expr) return null
    while (true) {
      if (!this.accept("{")) break
      const key = this.mustKeyString()
      if (this.accept("}")) {
        expr = { tag: "callTag", receiver: expr, value: key }
        continue
      }
      const args = [this.callArg(key)]
      while (!this.accept("}")) {
        args.push(this.callArg(this.mustKeyString()))
      }
      expr = { tag: "callArgs", receiver: expr, args }
    }
    return expr
  }

  callArg(key: string): CallArg {
    this.mustAccept(":")
    const expr = this.mustExpr()
    return { tag: "expr", key, expr }
  }

  baseExpr(): Expr | null {
    const tok = this.token
    switch (tok.tag) {
      case "number":
        this.advance()
        return { tag: "number", value: tok.value }
      case "string":
        this.advance()
        return { tag: "string", value: tok.value }
      case "identifier":
        this.advance()
        return { tag: "identifier", name: tok.value }
      case "cluster":
        this.advance()
        return { tag: "clusterIdent", name: tok.value }
      case "(": {
        this.advance()
        const expr = this.expr()
        this.mustAccept(")")
        return expr
      }
      case "[":
        return this.frame()
      default:
        return null
    }
  }

  frame(): Expr {
    this.mustAccept("[")
    const entries: FrameEntry[] = []
    // get tag or first field pair
    const keyString = this.keyString()
    if (keyString) {
      if (this.accept("]")) {
        return { tag: "frameTag", value: keyString }
      }
      this.mustAccept(":")
      const expr = this.mustExpr()
      entries.push({ tag: "field", key: keyString, expr })
    }

    while (!this.accept("]")) {
      const keyString = this.mustKeyString()
      this.mustAccept(":")
      const expr = this.mustExpr()
      entries.push({ tag: "field", key: keyString, expr })
    }
    return { tag: "frameEntries", entries }
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
          return strs.join(" ")
      }
    }
  }
}
