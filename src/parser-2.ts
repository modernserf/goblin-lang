import { Parser, Match, Alt, Defer } from "./combinator"

const space = new Match(/\s+/)
const comment = new Match(/#[^\n]+/)
const __ = space.or(comment).repeat()

function kw(keyword: string) {
  return new Match(new RegExp(keyword)).skip(new Match(/\w/).fail())
}

// TODO: decimals, exponents, different bases, underscores
const number = new Match(/\d+/).map(Number)
const string = new Match(/"(?:\\"|[^"])*"/).map((str) =>
  str.slice(1, -1).replace(/\\"/g, `"`)
)
const identifier = new Match(/[a-zA-Z][a-zA-Z0-9_]*/).or(
  new Match(/_(?:\\_|[^_])*_/).map((str) => str.slice(1, -1))
)
const operator = new Match(/[-~!@$%^&*+|<>,?/=]+/)
const key = new Match(/[^:#\[\]\{\}]+/)

type Binding = { tag: "identifier"; value: string }

type Param =
  | { tag: "pair"; key: string; binding: Binding }
  | { tag: "key"; key: string }

type Method = { tag: "method"; params: Param[]; body: Statement[] }

type Field =
  | { tag: "pair"; key: string; argument: Expr }
  | { tag: "key"; key: string }

type Expr =
  | { tag: "number"; value: number }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "object"; fields: (Method | Field)[] }
  | { tag: "call"; target: Expr; message: Field[] }

type Statement =
  | { tag: "let"; binding: Binding; expr: Expr }
  | { tag: "return"; expr: Expr }
  | { tag: "expr"; expr: Expr }

// TODO: destructuring, matching
const binding = new Alt<Binding>([
  identifier.map((value) => ({ tag: "identifier", value })),
])

// TODO: var, block
const arg = new Alt([new Defer(() => expression)])

// TODO: var, block, blank keys
const param = new Alt<Param>([
  key
    .skip(__)
    .skip(new Match(/:/))
    .skip(__)
    .map2(binding, (key, binding) => ({
      tag: "pair",
      key,
      binding,
    })),
  key.map((key) => ({ tag: "key", key })),
])

const method = new Match(/\{/)
  .then(__)
  .then(param.skip(__).repeat())
  .skip(new Match(/\}/))
  .skip(__)
  .map2(new Defer(() => body), (params, body) => ({
    tag: "method" as const,
    params,
    body,
  }))

const field = new Alt<Field>([
  key
    .skip(__)
    .skip(new Match(/:/))
    .skip(__)
    .map2(arg, (key, argument) => ({ tag: "pair", key, argument })),
  key.map((key) => ({ tag: "key", key })),
])

const baseExpression = new Alt<Expr>([
  new Match(/\(/).then(new Defer(() => expression).skip(new Match(/\)/))),
  number.map((value) => ({ tag: "number", value })),
  string.map((value) => ({ tag: "string", value })),
  identifier.map((value) => ({ tag: "identifier", value })),
  new Match(/\[/)
    .then(__)
    .then(method.or(field).skip(__).repeat())
    .skip(__)
    .skip(new Match(/\]/))
    .map((fields) => ({ tag: "object", fields })),
])

const message = new Match(/\{/)
  .skip(__)
  .then(field.skip(__).repeat())
  .skip(__)
  .skip(new Match(/\}/))

const callExpression = baseExpression.map2(
  message.skip(__).repeat(),
  (target, fields) =>
    fields.reduce(
      (target, message) => ({ tag: "call" as const, target, message }),
      target
    )
)

const unaryOpExpr = operator
  .skip(__)
  .repeat()
  .map2(callExpression, (ops, target) =>
    ops.reduceRight(
      (target, op) => ({
        tag: "call" as const,
        target,
        message: [{ tag: "key" as const, key: op }],
      }),
      target
    )
  )

const binaryOpExpr = unaryOpExpr
  .skip(__)
  .map2(operator.skip(__).seq(unaryOpExpr).skip(__).repeat(), (l, ops) =>
    ops.reduce(
      (target, [key, argument]) => ({
        tag: "call" as const,
        target,
        message: [{ tag: "pair" as const, key, argument }],
      }),
      l
    )
  )

const expression: Parser<Expr> = binaryOpExpr
  .skip(__)
  .skip(new Match(/;/).opt())

const statement = new Alt<Statement>([
  kw("let")
    .skip(__)
    .then(binding)
    .skip(__)
    .skip(new Match(/:=/))
    .skip(__)
    .map2(expression, (binding, expr) => ({ tag: "let", binding, expr })),
  kw("return")
    .skip(__)
    .then(expression)
    .map((expr) => ({ tag: "return", expr })),
  expression.map((expr) => ({ tag: "expr", expr })),
])

const body = statement.skip(__).repeat()

export const program = __.then(body).skip(__)
