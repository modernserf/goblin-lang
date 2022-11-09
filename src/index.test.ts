const test = require("node:test")
import assert from "node:assert/strict"
import "./parser.test"
import "./compiler.test"
import "./ast.test"
import { run } from "./index"
import { PrimitiveTypeError } from "./ir"
import { readFile } from "node:fs/promises"

test("test file", async () => {
  const file = await readFile("./src/test.gob", { encoding: "utf-8" })
  run(file)
})

test("hello world", () => {
  const res: any = run(`"Hello, world!"`)
  assert.deepEqual(res.value, "Hello, world!")
})

test("primitive methods", () => {
  const res: any = run(`1 + 2`)
  assert.deepEqual(res.value, 3)

  assert.throws(() => {
    run(`1 + "hello"`)
  }, PrimitiveTypeError)
})

test("operator precedence", () => {
  const a: any = run(`2 + 3 * 4`)
  assert.deepEqual(a.value, 20)
  const b: any = run(`2 + (3 * 4)`)
  assert.deepEqual(b.value, 14)
  const c: any = run(`2 - 1`)
  assert.deepEqual(c.value, 1)
  const d: any = run(`2; - 1`)
  assert.deepEqual(d.value, -1)
})

test("locals", () => {
  const res: any = run(`
    let x := 1
    let y := 2
    x
  `)
  assert.deepEqual(res.value, 1)
})

test("objects", () => {
  const res: any = run(`
    let x := [
      {} 1;
      {foo} 2;
      {bar: arg} arg;
      {_baz_} baz;
    ]
    let bar := 3
    x{} + x{foo} + x{_bar_} + x{baz: 4}
  `)
  assert.deepEqual(res.value, 10)
})

test("frames", () => {
  const res: any = run(`
    let bar := 2
    let x := [foo: 1 _bar_]
    x{foo} + x{bar}
  `)
  assert.deepEqual(res.value, 3)
})

test("destructuring", () => {
  const res: any = run(`
    let [x: foo y: [_a_ _b_]] := [x: 1 y: [a: 2 b: 3]]
    foo + a + b
  `)
  assert.deepEqual(res.value, 6)
})

test("destructuring args", () => {
  const res: any = run(`
    let p := [
      {add: [x: x1 y: y1] to: [x: x2 y: y2]}
        [x: x1 + x2 y: y1 + y2];
    ]
    let result := p{add: [x: 1 y: 1] to: [x: 2 y: 2]}
    result{y}
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
  const res2: any = run(`
    let empty := []
    let match := [
      {} 1;
      {other} 2;
    ]
    empty{:match}
  `)
  assert.deepEqual(res2.value, 1)
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

  const indirect: any = run(`
    let obj := [
      {x} 1;
      {y} obj{x};
    ]
    obj{y}
  `)
  assert.deepEqual(indirect.value, 1)
})

test("classes, closures", () => {
  const res: any = run(`
    let Opt := [
      {some: value} [
        {map: fn}
          let next := fn{: value}
          Opt{some: next};
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

test("deep closures", () => {
  const res: any = run(`
    let val := 1
    let obj := [
      {foo} [
        {bar} [
          {baz} val
        ]
      ]
    ]
    obj{foo}{bar}{baz}
  `)
  assert.deepEqual(res.value, 1)
})

test("var & set", () => {
  const res: any = run(`
    var x := 1
    set x := 2
    x
  `)
  assert.deepEqual(res.value, 2)

  const res2: any = run(`
    var x := 1
    let y := x
    set x := 2
    x + y
  `)
  assert.deepEqual(res2.value, 3)
})

test("var args", () => {
  const res: any = run(`
    let obj := [
      {inc: var x}
        set x := x + 1
        self
    ]
    var x := 1
    obj
      {inc: var x}
      {inc: var x}
    x
  `)
  assert.deepEqual(res.value, 3)

  run(`
    let obj := [
      {foo: x bar: var y}
        set y := x
        self
    ]
    var y := 0
    obj{foo: 2 bar: var y}
    y
  `)

  assert.throws(() => {
    run(`
      let obj := [
        {inc: var x}
          set x := x + 1
          self
      ]
      let x := 1
      obj{inc: var x}
    `)
  })

  assert.throws(() => {
    run(`
      let obj := [
        {inc: var x}
          set x := x + 1
          self
      ]
      var x := 1
      obj{inc: x}
    `)
  })
})

test("use/provide", () => {
  const res: any = run(`
    let obj := [{get} use foo]

    provide foo := 1
    let x := obj{get}
    provide foo := 2
    let y := obj{get}

    x + y
  `)
  assert.deepEqual(res.value, 3)

  const res2: any = run(`
    let a := [{get} use foo]
    provide foo := 3
    let b := [
      {provide 1: fn} 
        provide foo := 1
        fn{get};
      {provide 2: fn}
        provide foo := 2
        fn{get};
    ]
    
    b{provide 1: a} + b{provide 2: a} + a{get}
  `)
  assert.deepEqual(res2.value, 6)

  assert.throws(() => {
    run(`
      let obj := [{get} use foo]
      obj{get}
    `)
  })
})

test("cell", () => {
  run(`
    import [_Cell_ _Assert_] := "core"

    let a := Cell{: 0}
    let b := a
    a{set: 1}
    
    Assert{expected: 1 received: b{get}}
  `)
  // assert.deepEqual(res.value, 1)
})
