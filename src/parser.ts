// Parse tree -- a loose grammar that covers the basic shape of the language

import { keywords, Lexer, Token } from "./lexer"
import {
  OnHandler,
  ElseHandler,
  Self,
  ParseInt,
  ParseFloat,
  ParseString,
  ParseIdent,
  ParseParens,
  Unit,
  ParseObject,
  ParseFrame,
  ParseDoBlock,
  ParseIf,
  ParseSend,
  ParseUnaryOp,
  ParseBinaryOp,
  ParseTrySend,
  ParseDestructure,
} from "./expr"
import {
  VarParam,
  DoParam,
  ValueParam,
  DefaultValueParam,
  ParamsBuilder,
} from "./params"
import { VarArg, HandlersArg, ValueArg, ArgsBuilder } from "./args"
import {
  LetStmt,
  VarStmt,
  ImportStmt,
  SetStmt,
  SetInPlaceStmt,
  ProvideStmt,
  UsingStmt,
  ReturnStmt,
  DeferStmt,
  ExprStmt,
} from "./stmt"
import {
  ParseArg,
  ParseExpr,
  ParseHandler,
  ParseStmt,
  ParseParam,
  ParseArgs,
  ParseParams,
  PatternBuilder,
  ParseBinding,
} from "./interface"

export class ParseError {
  constructor(readonly expected: string, readonly received: string) {}
}

type Parser<T> = (lexer: Lexer) => T

function param(lexer: Lexer): ParseParam {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return new VarParam(ident(lexer))
    case "do":
      lexer.advance()
      return new DoParam(ident(lexer))
    // TODO: refutable bindings
    default:
      const value = must(lexer, "binding", parseBinding)
      if (accept(lexer, "colonEquals")) {
        const defaultValue = must(lexer, "expr", parseExpr)
        return new DefaultValueParam(value, defaultValue)
      }
      return new ValueParam(value)
  }
}

function arg(lexer: Lexer): ParseArg {
  const token = lexer.peek()
  switch (token.tag) {
    case "var":
      lexer.advance()
      return new VarArg(ident(lexer))
    case "on":
    case "else":
    case "openBrace":
      return new HandlersArg(parseHandlers(lexer))
    default:
      return new ValueArg(must(lexer, "expr", parseExpr))
  }
}

function ident(lexer: Lexer): string {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return token.value
  }
  throw new ParseError("identifier", token.tag)
}

function keyPart(lexer: Lexer): string | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "operator":
      lexer.advance()
      return token.value
    case "integer":
      lexer.advance()
      return String(token.value)
    default:
      if (keywords.has(token.tag)) {
        lexer.advance()
        return token.tag
      }
      return null
  }
}

function parseKey(lexer: Lexer): string {
  return repeat(lexer, keyPart).join(" ")
}

function parsePattern<Item, Collection>(
  lexer: Lexer,
  parser: Parser<Item>,
  builder: PatternBuilder<Item, Collection>
): Collection {
  while (true) {
    const token = lexer.peek()
    if (token.tag === "quotedIdent") {
      lexer.advance()
      builder.punPair(token.value)
      continue
    }

    const key = parseKey(lexer)
    if (accept(lexer, "colon")) {
      const value = must(lexer, "arg", parser)
      builder.pair(key, value)
      continue
    } else if (key) {
      return builder.key(key)
    } else {
      return builder.build()
    }
  }
}

function parseParams(lexer: Lexer): ParseParams | null {
  if (!accept(lexer, "openBrace")) return null
  const res = parsePattern(lexer, param, new ParamsBuilder())
  mustToken(lexer, "closeBrace")
  return res
}

function parseArgs(lexer: Lexer): ParseArgs {
  return parsePattern(lexer, arg, new ArgsBuilder())
}

function parseHandlers(lexer: Lexer): ParseHandler[] {
  if (lexer.peek().tag === "openBrace") {
    const messages = repeat1(lexer, "handler", parseParams)
    const body = repeat(lexer, parseStmt)
    return messages.map((message) => new OnHandler(message, body))
  }
  const out: ParseHandler[] = []
  while (true) {
    if (accept(lexer, "else")) {
      const body = repeat(lexer, parseStmt)
      out.push(new ElseHandler(body))
    } else if (accept(lexer, "on")) {
      const messages = repeat1(lexer, "handler", parseParams)
      const body = repeat(lexer, parseStmt)
      out.push(...messages.map((message) => new OnHandler(message, body)))
    } else {
      accept(lexer, "end")
      return out
    }
  }
}

function parseBinding(lexer: Lexer): ParseBinding | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return new ParseIdent(token.value)
    case "openBracket": {
      lexer.advance()
      const params = parsePattern(lexer, param, new ParamsBuilder())
      mustToken(lexer, "closeBracket")
      if (accept(lexer, "as")) {
        const as = ident(lexer)
        return new ParseDestructure(params, as)
      }
      return new ParseDestructure(params, null)
    }
  }
  return null
}

function parseIf(lexer: Lexer): ParseExpr {
  const cond = must(lexer, "expr", parseExpr)
  mustToken(lexer, "then")
  const ifTrue = repeat(lexer, parseStmt)
  if (accept(lexer, "end")) {
    return new ParseIf(cond, ifTrue, [])
  }
  mustToken(lexer, "else")
  if (accept(lexer, "if")) {
    const ifFalse = [new ExprStmt(parseIf(lexer))]
    return new ParseIf(cond, ifTrue, ifFalse)
  }
  const ifFalse = repeat(lexer, parseStmt)
  mustToken(lexer, "end")
  return new ParseIf(cond, ifTrue, ifFalse)
}

function baseExpr(lexer: Lexer): ParseExpr | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "self":
      lexer.advance()
      return Self
    case "integer":
      lexer.advance()
      return new ParseInt(token.value)
    case "float":
      lexer.advance()
      return new ParseFloat(token.value)
    case "string":
      lexer.advance()
      return new ParseString(token.value)
    case "identifier":
    case "quotedIdent":
      lexer.advance()
      return new ParseIdent(token.value)
    case "openParen": {
      lexer.advance()
      const value = parseExpr(lexer)
      mustToken(lexer, "closeParen")
      if (value) {
        return new ParseParens(value)
      } else {
        return Unit
      }
    }
    case "openBracket": {
      lexer.advance()
      const handlers = parseHandlers(lexer)
      if (handlers.length) {
        mustToken(lexer, "closeBracket")
        return new ParseObject(handlers)
      }
      const message = parseArgs(lexer)
      mustToken(lexer, "closeBracket")
      return new ParseFrame(message)
    }
    case "do": {
      lexer.advance()
      const body = repeat(lexer, parseStmt)
      mustToken(lexer, "end")
      return new ParseDoBlock(body)
    }
    case "if": {
      lexer.advance()
      return parseIf(lexer)
    }
    default:
      return null
  }
}

function callExpr(lexer: Lexer): ParseExpr | null {
  let target = baseExpr(lexer)
  if (!target) return null
  while (true) {
    if (!accept(lexer, "openBrace")) return target
    const args = parseArgs(lexer)
    mustToken(lexer, "closeBrace")
    if (accept(lexer, "questionMark")) {
      const orElse = must(lexer, "expr", parseExpr)
      return new ParseTrySend(target, args, orElse)
    } else {
      target = new ParseSend(target, args)
    }
  }
}

function unaryOpExpr(lexer: Lexer): ParseExpr | null {
  const op = accept(lexer, "operator")
  if (!op) return callExpr(lexer)
  const target = must(lexer, "expr", unaryOpExpr)
  return new ParseUnaryOp(target, op.value)
}

function binaryOpExpr(lexer: Lexer): ParseExpr | null {
  let target = unaryOpExpr(lexer)
  if (!target) return null
  while (true) {
    const op = accept(lexer, "operator")
    if (!op) return target
    const arg = must(lexer, "expr", unaryOpExpr)
    target = new ParseBinaryOp(target, op.value, arg)
  }
}

function parseExpr(lexer: Lexer): ParseExpr | null {
  const value = binaryOpExpr(lexer)
  if (!value) return null
  accept(lexer, "semicolon")
  return value
}

function assign(lexer: Lexer): { binding: ParseBinding; expr: ParseExpr } {
  const binding = must(lexer, "binding", parseBinding)
  mustToken(lexer, "colonEquals")
  const expr = must(lexer, "expr", parseExpr)
  return { binding, expr }
}

function parseStmt(lexer: Lexer): ParseStmt | null {
  const token = lexer.peek()
  switch (token.tag) {
    case "export": {
      lexer.advance()
      mustToken(lexer, "let")
      const { binding, expr } = assign(lexer)
      return new LetStmt(binding, expr, true)
    }
    case "let": {
      lexer.advance()
      const { binding, expr } = assign(lexer)
      return new LetStmt(binding, expr, false)
    }
    case "var": {
      lexer.advance()
      const { binding, expr } = assign(lexer)
      return new VarStmt(binding, expr)
    }
    case "import": {
      lexer.advance()
      const { binding, expr } = assign(lexer)
      return new ImportStmt(binding, expr)
    }
    case "set": {
      lexer.advance()
      const place = must(lexer, "binding", parseExpr)
      if (accept(lexer, "colonEquals")) {
        // ugh
        if (place instanceof ParseIdent) {
          const expr = must(lexer, "expr", parseExpr)
          return new SetStmt(place, expr)
        } else {
          throw new ParseError("binding", "expr")
        }
      } else {
        return new SetInPlaceStmt(place)
      }
    }
    case "provide": {
      lexer.advance()
      mustToken(lexer, "openBrace")
      const message = parseArgs(lexer)
      mustToken(lexer, "closeBrace")
      return new ProvideStmt(message)
    }
    case "using": {
      lexer.advance()
      const message = must(lexer, "params", parseParams)
      return new UsingStmt(message)
    }
    case "return": {
      lexer.advance()
      const value = parseExpr(lexer)
      return new ReturnStmt(value || Unit)
    }
    case "defer": {
      lexer.advance()
      const body = repeat(lexer, parseStmt)
      mustToken(lexer, "end")
      return new DeferStmt(body)
    }
    default: {
      const expr = parseExpr(lexer)
      if (!expr) return null
      return new ExprStmt(expr)
    }
  }
}

export function program(lexer: Lexer): ParseStmt[] {
  const out = repeat(lexer, parseStmt)
  mustToken(lexer, "eof")
  return out
}

// utils
function repeat<T>(lexer: Lexer, parser: (l: Lexer) => T | null): T[] {
  const out: T[] = []
  let lastToken = lexer.peek()
  while (true) {
    const res = parser(lexer)
    if (res === null) break
    out.push(res)
    /* istanbul ignore next */
    if (lexer.peek() === lastToken) {
      throw new Error(`stuck at token ${JSON.stringify(lastToken)}`)
    }
    lastToken = lexer.peek()
  }
  return out
}

function repeat1<T>(
  lexer: Lexer,
  expected: string,
  parser: (l: Lexer) => T | null
): T[] {
  const first = must(lexer, expected, parser)
  const rest = repeat(lexer, parser)
  return [first, ...rest]
}

function accept<Tag extends Token["tag"]>(
  lexer: Lexer,
  tag: Tag
): (Token & { tag: Tag }) | null {
  const token = lexer.peek()
  if (token.tag === tag) {
    lexer.advance()
    return token as Token & { tag: Tag }
  }
  return null
}

function mustToken<Tag extends Token["tag"]>(
  lexer: Lexer,
  tag: Tag
): Token & { tag: Tag } {
  const token = lexer.peek()
  if (tag === token.tag) {
    lexer.advance()
    return token as Token & { tag: Tag }
  }

  throw new ParseError(tag, token.tag)
}

function must<T>(
  lexer: Lexer,
  name: string,
  parser: (l: Lexer) => T | null
): T {
  const res = parser(lexer)
  if (res === null) throw new ParseError(name, lexer.peek().tag)
  return res
}
