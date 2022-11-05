export type Token =
  | { tag: "integer"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "quotedIdent"; value: string }
  | { tag: "operator"; value: string }
  | { tag: "self" }
  | { tag: "let" }
  | { tag: "return" }
  | { tag: "openBracket" }
  | { tag: "closeBracket" }
  | { tag: "openBrace" }
  | { tag: "closeBrace" }
  | { tag: "openParen" }
  | { tag: "closeParen" }
  | { tag: "semicolon" }
  | { tag: "colon" }
  | { tag: "colonEquals" }
  | { tag: "end" }

const re = {
  commentWhitespace: /(?:#[^\n]*|\s)+/y,
  integer: /[0-9][0-9_]*/y,
  string: /"(?:\\"|[^"])*"/y,
  identKw: /[a-zA-Z][a-zA-Z0-9_]*/y,
  identUnderscore: /_[^_]*_/y,
  operator: /[-~!@$%^&*+|<>,?/=]+/y,
  punctuation: /:=|[\[\]\(\)\{\}:;]/y,
}
const matcherTable = {
  ":=": "colonEquals",
  ":": "colon",
  ";": "semicolon",
  "[": "openBracket",
  "]": "closeBracket",
  "(": "openParen",
  ")": "closeParen",
  "{": "openBrace",
  "}": "closeBrace",
} as const
type MatcherTable = typeof matcherTable

type Option<T> = { value: T } | null

export class Lexer {
  private index = 0
  private peekCache: Token | null = null
  constructor(private code: string) {}
  *[Symbol.iterator](): Iterator<Token> {
    while (true) {
      this.ignoreWhitespace()
      if (this.index >= this.code.length) return
      yield this.next()
    }
  }
  peek(): Token {
    if (this.peekCache) return this.peekCache
    this.ignoreWhitespace()
    if (this.index >= this.code.length) return { tag: "end" }
    const next = this.next()
    this.peekCache = next
    return next
  }
  advance() {
    this.peekCache = null
  }
  private next(): Token {
    const intm = this.callRe(re.integer)
    if (intm)
      return { tag: "integer", value: Number(intm.value.replace(/_/g, "")) }

    const str = this.callRe(re.string)
    if (str) {
      return {
        tag: "string",
        value: str.value.slice(1, -1).replace(/\\"/g, '"'),
      }
    }

    const ident = this.callRe(re.identKw)
    if (ident) {
      switch (ident.value) {
        case "self":
          return { tag: "self" }
        case "let":
          return { tag: "let" }
        case "return":
          return { tag: "return" }
        default:
          return { tag: "identifier", value: ident.value }
      }
    }

    const identU = this.callRe(re.identUnderscore)
    if (identU) {
      return {
        tag: "quotedIdent",
        value: identU.value.slice(1, -1).replace(/\s+/g, " "),
      }
    }

    const op = this.callRe(re.operator)
    if (op) {
      return { tag: "operator", value: op.value }
    }

    const punc = this.callRe(re.punctuation)
    if (punc) {
      return { tag: matcherTable[punc.value as keyof MatcherTable] }
    }

    console.error()

    throw new Error("Unknown token")
  }
  private ignoreWhitespace() {
    re.commentWhitespace.lastIndex = this.index
    const res = re.commentWhitespace.exec(this.code)
    if (res) {
      this.index = re.commentWhitespace.lastIndex
    }
  }
  private callRe(re: RegExp): Option<string> {
    re.lastIndex = this.index
    const out = re.exec(this.code)
    if (out) {
      this.index = re.lastIndex
      return { value: out[0] }
    }
    return null
  }
}
