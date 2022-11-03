const test = require("node:test")
import assert from "node:assert/strict"

import { program } from "./parser-2"

test("empty", () => {
  assert.deepEqual(program.parseString(""), [])
})

test("comment, whitespace, number", () => {
  assert.deepEqual(
    program.parseString(`
  # a comment
  123
  # another
  `),
    [
      {
        tag: "expr",
        expr: { tag: "number", value: 123 },
      },
    ]
  )
})

test("string", () => {
  assert.deepEqual(
    program.parseString(`
    "hello"
    "she said \\"hello\\""
  `),
    [
      { tag: "expr", expr: { tag: "string", value: "hello" } },
      { tag: "expr", expr: { tag: "string", value: 'she said "hello"' } },
    ]
  )
})

test("identifier", () => {
  assert.deepEqual(program.parseString(`foo123_ _bar baz_`), [
    { tag: "expr", expr: { tag: "identifier", value: "foo123_" } },
    { tag: "expr", expr: { tag: "identifier", value: "bar baz" } },
  ])
})

test("call empty", () => {
  assert.deepEqual(program.parseString(`foo{}`), [
    {
      tag: "expr",
      expr: {
        tag: "call",
        message: [],
        target: { tag: "identifier", value: "foo" },
      },
    },
  ])
})

test("call key", () => {
  assert.deepEqual(program.parseString(`foo{bar baz}`), [
    {
      tag: "expr",
      expr: {
        tag: "call",
        message: [
          {
            tag: "key",
            key: "bar baz",
          },
        ],
        target: { tag: "identifier", value: "foo" },
      },
    },
  ])
})

test("call pairs", () => {
  assert.deepEqual(
    program.parseString(`
    foo{
      bar: baz 
      quux xyzzy: plugh
    }`),
    [
      {
        tag: "expr",
        expr: {
          tag: "call",
          message: [
            {
              tag: "pair",
              key: "bar",
              argument: { tag: "identifier", value: "baz" },
            },
            {
              tag: "pair",
              key: "quux xyzzy",
              argument: { tag: "identifier", value: "plugh" },
            },
          ],
          target: { tag: "identifier", value: "foo" },
        },
      },
    ]
  )
})

test("call chain", () => {
  assert.deepEqual(
    program.parseString(`
    foo{bar}
      { baz: quux }
    `),
    [
      {
        tag: "expr",
        expr: {
          tag: "call",
          message: [
            {
              tag: "pair",
              key: "baz",
              argument: { tag: "identifier", value: "quux" },
            },
          ],
          target: {
            tag: "call",
            message: [{ tag: "key", key: "bar" }],
            target: { tag: "identifier", value: "foo" },
          },
        },
      },
    ]
  )
})

test("unary op", () => {
  assert.deepEqual(program.parseString(`-1`), [
    {
      tag: "expr",
      expr: {
        tag: "call",
        message: [{ tag: "key", key: "-" }],
        target: { tag: "number", value: 1 },
      },
    },
  ])
})

test("binary op", () => {
  assert.deepEqual(program.parseString(`1 + 2`), [
    {
      tag: "expr",
      expr: {
        tag: "call",
        message: [
          { tag: "pair", key: "+", argument: { tag: "number", value: 2 } },
        ],
        target: { tag: "number", value: 1 },
      },
    },
  ])
})

test("semicolon", () => {
  assert.deepEqual(program.parseString(`1; -2`), [
    { tag: "expr", expr: { tag: "number", value: 1 } },
    {
      tag: "expr",
      expr: {
        tag: "call",
        message: [{ tag: "key", key: "-" }],
        target: { tag: "number", value: 2 },
      },
    },
  ])
})

test("frame empty", () => {
  assert.deepEqual(program.parseString(`[]`), [
    {
      tag: "expr",
      expr: {
        tag: "object",
        fields: [],
      },
    },
  ])
})

test("frame key", () => {
  assert.deepEqual(program.parseString(`[foo bar]`), [
    {
      tag: "expr",
      expr: {
        tag: "object",
        fields: [{ tag: "key", key: "foo bar" }],
      },
    },
  ])
})

test("frame pair sorting", () => {
  assert.deepEqual(program.parseString(`[foo: 1 bar: 2]`), [
    {
      tag: "expr",
      expr: {
        tag: "object",
        fields: [
          { tag: "pair", key: "bar", argument: { tag: "number", value: 2 } },
          { tag: "pair", key: "foo", argument: { tag: "number", value: 1 } },
        ],
      },
    },
  ])
})

test("methods", () => {
  assert.deepEqual(
    program.parseString(`
    [
      {x} 1;
      {x: x} x;
    ]
  `),
    [
      {
        tag: "expr",
        expr: {
          tag: "object",
          fields: [
            {
              tag: "method",
              params: [{ tag: "key", key: "x" }],
              body: [{ tag: "expr", expr: { tag: "number", value: 1 } }],
            },
            {
              tag: "method",
              params: [
                {
                  tag: "pair",
                  key: "x",
                  binding: { tag: "identifier", value: "x" },
                },
              ],
              body: [{ tag: "expr", expr: { tag: "identifier", value: "x" } }],
            },
          ],
        },
      },
    ]
  )
})
