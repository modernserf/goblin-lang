import {
  ASTArgsBuilder,
  ASTBind,
  ASTCallExpr,
  ASTCallKeyExpr,
  ASTExpr,
  ASTExprStmt,
  ASTIdentifierBind,
  ASTIdentifierExpr,
  ASTIntegerExpr,
  ASTLetStmt,
  ASTMethodBuilder,
  ASTObjectBuilder,
  ASTProgram,
  ASTReturnStmt,
  ASTSelfExpr,
  ASTSortedMap,
  ASTSortedPair,
  ASTStmt,
  ASTStringExpr,
} from "./ast-2"
import { Token } from "./token"

function next<From, To>(
  first: Matcher<From>,
  fn: (parser: Parser, value: From) => To
) {
  return { first, fn }
}

type Matcher<Result> = {
  integer?(parser: Parser, value: number): Result
  string?(parser: Parser, value: string): Result
  identifier?(parser: Parser, value: string): Result
  quotedIdent?(parser: Parser, value: string): Result
  operator?(parser: Parser, value: string): Result
  self?(parser: Parser): Result
  openBracket?(parser: Parser): Result
  closeBracket?(parser: Parser): Result
  openParen?(parser: Parser): Result
  closeParen?(parser: Parser): Result
  openBrace?(parser: Parser): Result
  closeBrace?(parser: Parser): Result
  semicolon?(parser: Parser): Result
  let?(parser: Parser): Result
  return?(parser: Parser): Result
  colonEquals?(parser: Parser): Result
  colon?(parser: Parser): Result
  // TODO: can I make this type flow?
  next?: { first: Matcher<any>; fn: (parser: Parser, value: any) => Result }
  default?(parser: Parser): Result
  end?(parser: Parser): Result
}

interface Lexer {
  peek(): Token
  advance(): void
}

export function parseProgram(lexer: Lexer): ASTProgram {
  return new Parser(lexer).match(program)
}

class Parser {
  constructor(private lexer: Lexer) {}
  match<Result>(matcher: Matcher<Result>): Result {
    const token = this.lexer.peek()
    if (token.tag === "end") throw new Error("end of input")
    const result = this.matchInner(token, matcher)
    if (result) {
      this.lexer.advance()
      return result.value
    }
    if (matcher.default) return matcher.default(this)
    throw new Error("no match")
  }
  private matchInner<Result>(
    token: Token,
    matcher: Matcher<Result>
  ): { value: Result } | null {
    if (matcher[token.tag]) {
      return { value: (matcher[token.tag] as any)(this, (token as any).value) }
    }

    if (matcher.next) {
      const next = this.matchInner(token, matcher.next.first)
      if (next) {
        return { value: matcher.next.fn(this, next.value) }
      }
    }
    return null
  }
  matchAll<Result>(matcher: Matcher<Result>): Result[] {
    if (matcher.default) {
      throw new Error("cannot use default matcher in matchAll")
    }
    const out: Result[] = []
    while (true) {
      const token = this.lexer.peek()
      if (!token) break
      const result = this.matchInner(token, matcher)
      if (!result) break
      this.lexer.advance()
      out.push(result.value)
    }
    return out
  }
}

const keyPart: Matcher<string> = {
  identifier(_, value) {
    return value
  },
  integer(_, value) {
    return String(value)
  },
  operator(_, value) {
    return value
  },
}

const key: Matcher<string> = {
  next: next(keyPart, (parser, first) => {
    const rest = parser.matchAll(keyPart)
    return [first, ...rest].join(" ")
  }),
}

const baseExpr: Matcher<ASTExpr> = {
  integer(_, value) {
    return new ASTIntegerExpr(value)
  },
  string(_, value) {
    return new ASTStringExpr(value)
  },
  identifier(_, value) {
    return new ASTIdentifierExpr(value)
  },
  quotedIdent(_, value) {
    return new ASTIdentifierExpr(value)
  },
  self(_) {
    return ASTSelfExpr
  },
  openBracket(parser) {
    const builder = new ASTObjectBuilder()
    parser.matchAll({
      next: next(key, (parser, key) => {
        parser.match({
          colon(parser) {
            const value = parser.match(expr)
            builder.addKeyValue(key, value)
          },
          default(_) {
            builder.addKey(key)
          },
        })
      }),
      // key-value pair
      quotedIdent(_, key) {
        builder.addKeyValue(key, new ASTIdentifierExpr(key))
      },
      // blank key
      colon(parser) {
        const value = parser.match(expr)
        builder.addKeyValue("", value)
      },
      openBrace(parser) {
        const mbuilder = new ASTMethodBuilder()
        parser.matchAll({
          next: next(key, (parser, key) => {
            mbuilder.addKey(key)
            parser.match({
              colon(parser) {
                const bind = parser.match(binding)
                mbuilder.addKeyValue(key, bind)
              },
              default(_) {
                builder.addKey(key)
              },
            })
          }),
          // key-value pair
          quotedIdent(_, key) {
            mbuilder.addKeyValue(key, new ASTIdentifierBind(key))
          },
          // blank key
          colon(parser) {
            const bind = parser.match(binding)
            mbuilder.addKeyValue("", bind)
          },
        })
        parser.match({ closeBrace() {} })
        const body = parser.matchAll(stmt)
        mbuilder.build(body)
      },
    })
    return builder.build()
  },
  openParen(parser) {
    const value = parser.match(expr)
    parser.match({ closeParen() {} })
    return value
  },
}

const callExpr: Matcher<ASTExpr> = {
  next: next(baseExpr, (parser, result) => {
    parser.matchAll({
      openBrace(parser) {
        const builder = new ASTArgsBuilder()
        parser.matchAll({
          next: next(key, (parser, key) => {
            parser.match({
              colon(parser) {
                const value = parser.match(expr)
                builder.addKeyValue(key, value)
              },
              default(parser) {
                builder.addKey(key)
              },
            })
          }),
          colon(parser) {
            const value = parser.match(expr)
            builder.addKeyValue("", value)
          },
        })
        parser.match({ closeBrace() {} })
        result = builder.build(result)
      },
    })
    return result
  }),
}

const prefixExpr: Matcher<ASTExpr> = {
  operator(parser, value) {
    const target = parser.match(prefixExpr)
    return new ASTCallKeyExpr(target, value)
  },
  next: next(callExpr, (_, x) => x),
}

const infixExpr: Matcher<ASTExpr> = {
  next: next(prefixExpr, (parser, left) => {
    return parser
      .matchAll({
        operator(parser, op) {
          const right = parser.match(prefixExpr)
          return { op, right }
        },
      })
      .reduce((left, { op, right }) => {
        return new ASTCallExpr(
          left,
          new ASTSortedMap([new ASTSortedPair(op, right)])
        )
      }, left)
  }),
}

const expr: Matcher<ASTExpr> = {
  next: next(infixExpr, (parser, val) => {
    parser.match({ semicolon() {}, default() {} })
    return val
  }),
}

const binding: Matcher<ASTBind> = {
  identifier(parser, value) {
    return new ASTIdentifierBind(value)
  },
  quotedIdent(parser, value) {
    return new ASTIdentifierBind(value)
  },
}

const stmt: Matcher<ASTStmt> = {
  let(parser) {
    const bind = parser.match(binding)
    parser.match({ colonEquals() {} })
    const value = parser.match(expr)
    return new ASTLetStmt(bind, value)
  },
  return(parser) {
    const value = parser.match(expr)
    return new ASTReturnStmt(value)
  },
  next: next(expr, (parser, value) => {
    return new ASTExprStmt(value)
  }),
}

const program: Matcher<ASTProgram> = {
  default(parser) {
    const prog = parser.matchAll(stmt)
    return new ASTProgram(prog)
  },
}
