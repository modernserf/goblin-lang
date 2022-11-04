const test = require("node:test")
import assert from "node:assert/strict"

import { Lexer } from "./token"
import { program } from "./parser-3"

// test

function parse(code: string) {
  return program(new Lexer(code))
}

test("empty program", () => {
  assert.deepEqual(parse(""), [])
})

test("simple expressions", () => {
  assert.deepEqual(
    parse(`
      123
      "hello, world"
      foo _foo bar_
      self
  `),
    [
      { tag: "integer", value: 123 },
      { tag: "string", value: "hello, world" },
      { tag: "identifier", value: "foo" },
      { tag: "identifier", value: "foo bar" },
      { tag: "self" },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("parens", () => {
  assert.deepEqual(
    parse(`
      (123)
    `),
    [{ tag: "expr", value: { tag: "integer", value: 123 } }]
  )

  assert.throws(() => {
    parse(`(123`)
  })
})

test("calls", () => {
  assert.deepEqual(
    parse(`
    x{}
    x{foo}
    x{foo: 1}
    x{_foo_}
    x{foo: 1 bar: 2}
    x{: 1}
    x{foo: 1}{bar: 2}
  `),
    [
      { tag: "call", target: { tag: "identifier", value: "x" }, args: [] },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [{ tag: "key", key: "foo" }],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          {
            tag: "pair",
            key: "foo",
            value: { tag: "identifier", value: "foo" },
          },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [{ tag: "pair", key: "", value: { tag: "integer", value: 1 } }],
      },
      {
        tag: "call",
        target: {
          tag: "call",
          target: { tag: "identifier", value: "x" },
          args: [
            { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          ],
        },
        args: [
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("objects", () => {
  assert.deepEqual(
    parse(`
    []
    [foo bar]
    [_foo_ _bar_]
    [foo: 1 bar: 2]
    [:1 :2]
  `),
    [
      { tag: "object", args: [] },
      { tag: "object", args: [{ tag: "key", key: "foo bar" }] },
      {
        tag: "object",
        args: [
          {
            tag: "pair",
            key: "foo",
            value: { tag: "identifier", value: "foo" },
          },
          {
            tag: "pair",
            key: "bar",
            value: { tag: "identifier", value: "bar" },
          },
        ],
      },
      {
        tag: "object",
        args: [
          { tag: "pair", key: "foo", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "bar", value: { tag: "integer", value: 2 } },
        ],
      },
      {
        tag: "object",
        args: [
          { tag: "pair", key: "", value: { tag: "integer", value: 1 } },
          { tag: "pair", key: "", value: { tag: "integer", value: 2 } },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("let, return stmts", () => {
  assert.deepEqual(
    parse(`
      let x := 1
      let _value of y_ := 2
      return x
    `),
    [
      {
        tag: "let",
        binding: { tag: "identifier", value: "x" },
        value: { tag: "integer", value: 1 },
      },
      {
        tag: "let",
        binding: { tag: "identifier", value: "value of y" },
        value: { tag: "integer", value: 2 },
      },
      { tag: "return", value: { tag: "identifier", value: "x" } },
    ]
  )
})

test("operators", () => {
  assert.deepEqual(
    parse(`
      +x
      x + y
      x + +y; # disambiguate from "x + + y + x + y"
      +x + y
    `),
    [
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [{ tag: "key", key: "+" }],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          { tag: "pair", key: "+", value: { tag: "identifier", value: "y" } },
        ],
      },
      {
        tag: "call",
        target: { tag: "identifier", value: "x" },
        args: [
          {
            tag: "pair",
            key: "+",
            value: {
              tag: "call",
              target: { tag: "identifier", value: "y" },
              args: [{ tag: "key", key: "+" }],
            },
          },
        ],
      },
      {
        tag: "call",
        target: {
          tag: "call",
          target: { tag: "identifier", value: "x" },
          args: [{ tag: "key", key: "+" }],
        },
        args: [
          { tag: "pair", key: "+", value: { tag: "identifier", value: "y" } },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})

test("method definitons", () => {
  assert.deepEqual(
    parse(`
    [{x} 1]
    [{x: y} y]
    [{_x_} x]
    [{: x} x]
    [{x: x y: y} y]
    [{x} 1; {y} 2]
  `),
    [
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [{ tag: "key", key: "x" }],
            body: [{ tag: "expr", value: { tag: "integer", value: 1 } }],
          },
        ],
      },
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [
              {
                tag: "pair",
                key: "x",
                value: { tag: "identifier", value: "y" },
              },
            ],
            body: [{ tag: "expr", value: { tag: "identifier", value: "y" } }],
          },
        ],
      },
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [
              {
                tag: "pair",
                key: "x",
                value: { tag: "identifier", value: "x" },
              },
            ],
            body: [{ tag: "expr", value: { tag: "identifier", value: "x" } }],
          },
        ],
      },
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [
              {
                tag: "pair",
                key: "",
                value: { tag: "identifier", value: "x" },
              },
            ],
            body: [{ tag: "expr", value: { tag: "identifier", value: "x" } }],
          },
        ],
      },
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [
              {
                tag: "pair",
                key: "x",
                value: { tag: "identifier", value: "x" },
              },
              {
                tag: "pair",
                key: "y",
                value: { tag: "identifier", value: "y" },
              },
            ],
            body: [{ tag: "expr", value: { tag: "identifier", value: "y" } }],
          },
        ],
      },
      {
        tag: "object",
        args: [
          {
            tag: "method",
            params: [{ tag: "key", key: "x" }],
            body: [{ tag: "expr", value: { tag: "integer", value: 1 } }],
          },
          {
            tag: "method",
            params: [{ tag: "key", key: "y" }],
            body: [{ tag: "expr", value: { tag: "integer", value: 2 } }],
          },
        ],
      },
    ].map((value) => ({ tag: "expr", value }))
  )
})
