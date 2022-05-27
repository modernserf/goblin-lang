const test = require("node:test")
import assert from "node:assert/strict"
import { Token } from "./lexer"
import { Parser, Expr } from "./parser"

function expr(tokens: Token[]): Expr {
  const parser = new Parser([...tokens, { tag: "end" }])
  const res = parser.expr()
  assert.notEqual(res, null)
  parser.done()
  return res!
}

test("number", () => {
  assert.deepEqual(expr([{ tag: "number", value: 123 }]), {
    tag: "number",
    value: 123,
  })
})

test("string", () => {
  assert.deepEqual(expr([{ tag: "string", value: "Hello, world" }]), {
    tag: "string",
    value: "Hello, world",
  })
})

test("identifier", () => {
  assert.deepEqual(expr([{ tag: "identifier", value: "foo" }]), {
    tag: "identifier",
    name: "foo",
  })
})

test("cluster identifier", () => {
  assert.deepEqual(expr([{ tag: "cluster", value: "Foo" }]), {
    tag: "clusterIdent",
    name: "Foo",
  })
})

test("frame tag", () => {
  assert.deepEqual(
    expr([{ tag: "[" }, { tag: "keyword", value: "foo" }, { tag: "]" }]),
    { tag: "frameTag", value: "foo" }
  )
  assert.deepEqual(
    expr([
      { tag: "[" },
      { tag: "keyword", value: "foo" },
      { tag: "keyword", value: "bar" },
      { tag: "keyword", value: "baz" },
      { tag: "]" },
    ]),
    { tag: "frameTag", value: "foo bar baz" }
  )
  assert.deepEqual(
    expr([{ tag: "[" }, { tag: "operator", value: "." }, { tag: "]" }]),
    { tag: "frameTag", value: "." }
  )
})

test("frame entries", () => {
  assert.deepEqual(expr([{ tag: "[" }, { tag: "]" }]), {
    tag: "frameEntries",
    entries: [],
  })
  assert.deepEqual(
    expr([
      { tag: "[" },
      { tag: "keyword", value: "x" },
      { tag: ":" },
      { tag: "number", value: 1 },
      { tag: "]" },
    ]),
    {
      tag: "frameEntries",
      entries: [{ tag: "field", key: "x", expr: { tag: "number", value: 1 } }],
    }
  )
})

test("invalid frames", () => {
  assert.throws(() => {
    expr([{ tag: "]" }])
  })
  assert.throws(() => {
    expr([{ tag: "[" }])
  })

  assert.throws(() => {
    expr([{ tag: "[" }, { tag: "number", value: 1 }, { tag: "]" }])
  })
  assert.throws(() => {
    expr([
      { tag: "[" },
      { tag: "keyword", value: "x" },
      { tag: ":" },
      { tag: "number", value: 1 },
      { tag: "keyword", value: "y" },
      { tag: "]" },
    ])
  })
  assert.throws(() => {
    expr([
      { tag: "[" },
      { tag: "keyword", value: "x" },
      { tag: ":" },
      { tag: "]" },
    ])
  })
})

test("call tag", () => {
  assert.deepEqual(
    expr([
      { tag: "identifier", value: "point" },
      { tag: "{" },
      { tag: "keyword", value: "x" },
      { tag: "}" },
    ]),
    {
      tag: "callTag",
      receiver: { tag: "identifier", name: "point" },
      value: "x",
    }
  )

  assert.deepEqual(
    expr([
      { tag: "identifier", value: "point" },
      { tag: "{" },
      { tag: "keyword", value: "x" },
      { tag: "}" },
      { tag: "{" },
      { tag: "keyword", value: "y" },
      { tag: "}" },
    ]),
    {
      tag: "callTag",
      receiver: {
        tag: "callTag",
        receiver: { tag: "identifier", name: "point" },
        value: "x",
      },
      value: "y",
    }
  )
})

test("call args", () => {
  assert.deepEqual(
    expr([
      { tag: "cluster", value: "Point" },
      { tag: "{" },
      { tag: "keyword", value: "x" },
      { tag: ":" },
      { tag: "number", value: 1 },
      { tag: "keyword", value: "y" },
      { tag: ":" },
      { tag: "number", value: 2 },
      { tag: "}" },
    ]),
    {
      tag: "callArgs",
      receiver: { tag: "clusterIdent", name: "Point" },
      args: [
        { tag: "expr", key: "x", expr: { tag: "number", value: 1 } },
        { tag: "expr", key: "y", expr: { tag: "number", value: 2 } },
      ],
    }
  )
})

test("invalid calls", () => {
  assert.throws(() => {
    expr([{ tag: "{" }, { tag: "keyword", value: "x" }, { tag: "}" }])
  })
  assert.throws(() => {
    expr([{ tag: "identifier", value: "point" }, { tag: "{" }])
  })
  assert.throws(() => {
    expr([{ tag: "}" }])
  })

  assert.throws(() => {
    expr([
      { tag: "identifier", value: "point" },
      { tag: "{" },
      { tag: "keyword", value: "x" },
      { tag: ":" },
      { tag: "number", value: 1 },
      { tag: "keyword", value: "y" },
      { tag: "}" },
    ])
  })
})

test("operators", () => {
  assert.deepEqual(
    expr([
      { tag: "identifier", value: "x" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "y" },
    ]),
    {
      tag: "callArgs",
      receiver: { tag: "identifier", name: "x" },
      args: [{ tag: "expr", key: "+", expr: { tag: "identifier", name: "y" } }],
    }
  )

  assert.deepEqual(
    expr([
      { tag: "identifier", value: "x" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "point" },
      { tag: "{" },
      { tag: "keyword", value: "y" },
      { tag: "}" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "z" },
    ]),
    {
      tag: "callArgs",
      receiver: {
        tag: "callArgs",
        receiver: { tag: "identifier", name: "x" },
        args: [
          {
            tag: "expr",
            key: "+",
            expr: {
              tag: "callTag",
              receiver: { tag: "identifier", name: "point" },
              value: "y",
            },
          },
        ],
      },
      args: [{ tag: "expr", key: "+", expr: { tag: "identifier", name: "z" } }],
    }
  )

  assert.deepEqual(
    expr([
      { tag: "(" },
      { tag: "identifier", value: "x" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "point" },
      { tag: ")" },
      { tag: "{" },
      { tag: "keyword", value: "y" },
      { tag: "}" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "z" },
    ]),
    {
      tag: "callArgs",
      receiver: {
        tag: "callTag",
        receiver: {
          tag: "callArgs",
          receiver: { tag: "identifier", name: "x" },
          args: [
            {
              tag: "expr",
              key: "+",
              expr: { tag: "identifier", name: "point" },
            },
          ],
        },
        value: "y",
      },
      args: [{ tag: "expr", key: "+", expr: { tag: "identifier", name: "z" } }],
    }
  )
})

test("invalid operators", () => {
  assert.throws(() => {
    expr([
      { tag: "identifier", value: "x" },
      { tag: "operator", value: "+" },
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "y" },
    ])
  })

  assert.throws(() => {
    expr([
      { tag: "identifier", value: "x" },
      { tag: "operator", value: "+" },
    ])
  })

  assert.throws(() => {
    expr([
      { tag: "operator", value: "+" },
      { tag: "identifier", value: "x" },
    ])
  })
})

test("invalid parens", () => {
  assert.throws(() => {
    expr([{ tag: ")" }])
  })
  assert.throws(() => {
    expr([{ tag: "(" }, { tag: "identifier", value: "x" }])
  })
  assert.throws(() => {
    expr([{ tag: "(" }, { tag: ")" }])
  })
})
