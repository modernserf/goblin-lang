export type Token =
  | { tag: "integer"; value: number }
  | { tag: "float"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "quotedIdent"; value: string }
  | { tag: "operator"; value: string }
  | { tag: "placeholder" }
  | { tag: "self" }
  | { tag: "let" }
  | { tag: "return" }
  | { tag: "var" }
  | { tag: "set" }
  | { tag: "provide" }
  | { tag: "using" }
  | { tag: "import" }
  | { tag: "export" }
  | { tag: "on" }
  | { tag: "if" }
  | { tag: "then" }
  | { tag: "else" }
  | { tag: "as" }
  | { tag: "do" }
  | { tag: "defer" }
  | { tag: "end" }
  | { tag: "openBracket" }
  | { tag: "closeBracket" }
  | { tag: "openBrace" }
  | { tag: "closeBrace" }
  | { tag: "openParen" }
  | { tag: "closeParen" }
  | { tag: "semicolon" }
  | { tag: "colon" }
  | { tag: "colonEquals" }
  | { tag: "questionMark" }
  | { tag: "eof" }

const re = {
  commentWhitespace: /(?:#[^\n]*|\s)+/y,
  integer: /[0-9][0-9_]*/y,
  float: /\.[0-9_]+/y,
  string: /"(?:\\"|[^"])*"/y,
  identKw: /[a-zA-Z][a-zA-Z0-9'_]*/y,
  identUnderscore: /_(?:\\_|[^_])*_/y,
  operator: /[-~!@$%^&*+|<>,/=]+/y,
  punctuation: /:=|[\[\]\(\)\{\}:;?]/y,
}

export const keywords: Set<Token["tag"]> = new Set([
  "self",
  "let",
  "return",
  "var",
  "set",
  "provide",
  "using",
  "import",
  "export",
  "on",
  "if",
  "then",
  "else",
  "as",
  "do",
  "defer",
  "end",
])

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
  "?": "questionMark",
} as const
type MatcherTable = typeof matcherTable

type Option<T> = { value: T } | null

export class LexerError {
  constructor(readonly index: number) {}
}

export class Lexer {
  private index = 0
  private peekCache: Token | null = null
  constructor(private code: string) {}
  peek(): Token {
    if (this.peekCache) return this.peekCache
    this.ignoreWhitespace()
    if (this.index >= this.code.length) return { tag: "eof" }
    const next = this.next()
    this.peekCache = next
    return next
  }
  advance() {
    this.peekCache = null
  }
  private next(): Token {
    const intm = this.callRe(re.integer)
    if (intm) {
      const floatm = this.callRe(re.float)
      if (floatm) {
        return {
          tag: "float",
          value: Number((intm.value + floatm.value).replace(/_/g, "")),
        }
      } else {
        return { tag: "integer", value: Number(intm.value.replace(/_/g, "")) }
      }
    }

    const str = this.callRe(re.string)
    if (str) {
      return {
        tag: "string",
        value: str.value.slice(1, -1).replace(/\\"/g, '"'),
      }
    }

    const ident = this.callRe(re.identKw)
    if (ident) {
      if (keywords.has(ident.value as any)) {
        return { tag: ident.value as any }
      }
      return { tag: "identifier", value: ident.value }
    }

    const identU = this.callRe(re.identUnderscore)
    if (identU) {
      const value = identU.value.slice(1, -1)
      if (!value) return { tag: "placeholder" }
      return { tag: "quotedIdent", value }
    }

    const op = this.callRe(re.operator)
    if (op) {
      return { tag: "operator", value: op.value }
    }

    const punc = this.callRe(re.punctuation)
    if (punc) {
      return { tag: matcherTable[punc.value as keyof MatcherTable] }
    }

    throw new LexerError(this.index)
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
