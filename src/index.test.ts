// import test from "node:test";
const test = require("node:test")
import assert from "node:assert/strict"
import "./lexer.test"
import "./parser.test"
import { run } from "./index"

test("hello world", () => {
  const res: any = run(`"Hello, world!"`)
  assert.deepEqual(res.value, "Hello, world!")
})

test("addition", () => {
  const res: any = run(`1 + 2`)
  assert.deepEqual(res.value, 3)
})

test("locals", () => {
  const res: any = run(`
    let x := 1
    let y := 2
    return x
  `)
  assert.deepEqual(res.value, 1)
})

test("objects", () => {
  const res: any = run(`
    let x := [
      {foo} 1
    ]
    x{foo}
  `)
  assert.deepEqual(res.value, 1)
})

test("frames", () => {
  const res: any = run(`
    let x := [foo: 1 bar: 2]
    x{foo} + x{bar}
  `)
  assert.deepEqual(res.value, 3)
})

test("pattern matching", () => {
  const res: any = run(`
    let foo := [some: 1]
    let bar := [none]
    let match := [
      {some: x} x;
      {none} 10;
    ]
    foo{:match} + bar{:match}
  `)
  assert.deepEqual(res.value, 11)
})

test("ivals", () => {
  const res: any = run(`
    let x := 1
    let obj := [
      {x} x
    ]
    obj{x}
  `)
  assert.deepEqual(res.value, 1)
})

test("self", () => {
  const res: any = run(`
    let obj := [
      {x} 1;
      {y} self{x};
    ]
    obj{y}
  `)
  assert.deepEqual(res.value, 1)
})

test("classes, closures", () => {
  const res: any = run(`
    let Opt := [
      {some: value}
        let class := self
        return [
          {map: fn}
            let next := fn{: value}
            class{some: next};
          {or default: __}
            value;
        ];
      {none} [
        {map: fn}
          self;
        {or default: value}
          value;
      ];
    ]
    let foo := Opt{some: 1}
    let bar := Opt{none}
    foo{map: [+: 1]}{or default: 10}
      + bar{map: [+: 1]}{or default: 10}
  `)
  assert.deepEqual(res.value, 12)
})
