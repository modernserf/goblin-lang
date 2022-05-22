# Goblin

A programming language for real sickos

## general syntax philosophy

Separate module / expression "worlds"
expressions only use operators in templates
performance is not a concern

## Comments

C-style comments `//` and `/* */`

In rich text representation, comments are italicized.

## Identifiers

Identifiers are "stropped" with underscores.

Whitespace is normalized, such that

```
_hello world_
_hello  world_
_hello
world_
```

refer to the same value

As shorthand, identifiers that start with lowercase letters & contain only letters, numbers & underscores can be used without underscore stropping. `a` and `_a_` refer to the same value.

In rich text representation, identifers are underlined.

## Strings

Strings are double-quoted, and can contain newlines. Backslash escapes characters. No interpolation, heredocs etc.

## Numbers

`0x` prefix for hex, `0b` for binary, `_` for non-semantic separators, leading `0` required for decimals. Like other languages that lack "ambient" infix operators (e.g. Clojure), literals include negation `-3` and fractions `1/3`.

Numbers are represented as arbitrary precision rationals.

## Frames

Frames are the core data structure in Goblin. A frame can be just a symbol, e.g. `[true] [false] [none]` or a key-value structure e.g. `[x: 1 y: 2]`.

The keys in frames can include numbers, (most) symbols and whitespace, and whitespace is normalized in the same way as identifiers. Leading & trailing whitespace is also ignored. `[left key: 1 right key: 2]`

The order of keys is not relevant for equality or type compatibility, but it is preserved when stringifying.

### impl note

Frames are implemented as anonymous clusters -- each frame literal has an anonymous cluster associated with it, and acts as a constructor for that cluster.

### Frame types & methods

given `let point := [x: 1 y: 2]`, you get

- get `point{x}` and `point{y}`
- set `point{x: 3}` and`point{y: 4}`
- update `point{update x: [++]}` and `point{update y} do |y| y[--]`
- apply `point{apply: target}` calls `target{x: 1 y: 2}` -- this doesn't seem super useful but a bunch of stuff depends on it
- equality, to hash, to string

### Extending frames

`[frame :: x: 1 y: 2]` constructs a new frame from an old one and some new fields.
TODO: how does this interact with methods? What if the "source" value isn't a frame? Does this create a new, "flat" anonymous cluster, or does it create a cluster that just _wraps_ the previous one?

### Frame methods & closures

Frames can have methods, in addition to fields, defined on them. These methods access the scope (including `self`) and control flow of the method they are defined in. All frame methods are public.

```
let f := [
  // getters (return type is inferred)
  {x} is 1
  {y} is 2
  // methods
  {x _x_: Num} is
    [x: _x_ y: me{y}]
  {y _y_: Num} is
    [x: me{x} y: y]

  // explicit return types
  {== _right_: [x: Num y: Num]}: Bool is
    Bool(
      Cmp(me{x} == right{x}) &&
      Cmp(me{y} == right{y})
    )
]
```

Frame methods return early with the `exit` keyword instead of `return`; `return` returns from the outer method. A frame that uses `return` in its methods has a restricted lifetime -- it cannot be stored beyond the scope of its method (ie it cannot exist adter the outer method returns.) This is also the case with `set`ing values in an outer scope.

The equivalent of anonymous functions in Goblin are frames with a single `apply` method, like `[{apply _arg_: Point}: arg{x}]`. A consequence of this convention is that a frame _without_ a defined `apply` method has a default implementation such that you can write `list{map: [+:1]}` and that will expand to `list{map: [{apply _val_: Num}: val{+: 1}]}`.

TODO: how should multi-argument closures work? something like `[{apply: Num arg1: Num}: left{+: right}]`? If we work backwards from `list{with: 0 fold:[+]}` where do we end up?
TODO: When would it be _necessary_ to annotate the return type? Just when its recursive, right? Are implicit conversions important here?
TODO: Frames also have the `me` dynamic variable instead of `self` that accesses their own fields -- is this useful? You could rig this up explicitly if you really wanted it. If you did `let frame = [x: 1 y: 2 {apply} ...]` and then set `{y: 3}`, would `frame{y}` in the apply method return 2 or 3?

### Pattern matching

TODO: do we want to discourage pattern matching, and thus force the awkward syntax? Or do we just want to have a solid theoretical basis for pattern matching, but also support it in syntax?

Pattern matching? also frames.

```
value{apply: [
  {none}: 0
  {some _value_: Vec}: value{length}
]}
```

A corrolary to this is that if `[x: 1]` can apply `[{x: Num}: T]` and `[y: 2]` can apply `[{y: Num}: T]` then the common type between them is:

```
[{apply: [
  {x: Num}: T
  {y: Num}: T
]}: T]
```

For default/unknown cases, you need to use reflection:

```
Reflect{
  match: value
  on: [
    {some: value}: value{length}
  ]
  with default: [{apply: __}: 0]
}
```

TODO: is this actually better than allowing any object to have something like `method_missing`?

## Calls

Functions, methods, module constants, type constructors, control flow all use a syntax similar to frames, but using curly braces.

- `[x: 1 y: 2]{x}` accessing the x field on a frame
- `Num{pi}` a constant defined on the Num module
- `"foo,bar,baz"{split: ","}` a method on a string
- `Point{x: 1 y: 2}` a constructor

a trailing `do` block is shorthand for passing a closure argument -- `foo{bar} do |arg| ...` expands to `foo{bar: [{apply: arg}: ...]}`

- `Vec(1,2,3){with: 0 fold} do |l, r| l{+:r}` two-arg block
- `Cmp(a <= b < c){else} do || return` block with control flow

## Templates

Unlike many languages, Goblin does not have arithmetic or boolean operators in its core grammar. Instead, operators are used in _templates_. Templates are type-safe embedded domain specific languages for working with operators and expressions.

Arithmetic:
`Num((a^2 + b^2)/2)`

Regular expressions:
`Regex([letter], ([letter]|[digit]|"_")*)`

even data structure literals ("," "..." "=>" are operators):
`Vec(1,2,3 ...rest)`
`Map("foo" => 1, "bar" => 2)`

See also "defining templates"

## Let & Set

Bindings are created like `let a := 1`

Values are immutable, but bindings can be updated

```
let a := 1
let b := a // a is 1, b is 1
set a := 2 // a is 2, b is 1
```

"Setter" methods return a new value, but can reassign the receiver with "set"

```
let a := [x: 1 y: 2]
let b := a{x: 2} // a is [x: 1 y: 2], b is [x: 2 y: 2]
set a{x: 3} // -> set a := a{x: 3};
```

TODO: mutating parameters?

Approach 1: `set` params.

```
// since receiver
let v := Vec(1,2,3)
let last := Vec{pop: set v} // v is Vec(1,2), last is 3
// mutate arg
set left{unify: set right}
```

Approach 2: `set` in destructuring

```
let v := Vec(1,2,3)
let [last: last rest: set v] = v{pop}
//
let [left: set left right: set right] := left{unify: right}
```

Real mutation is done with stateful processes, like in Erlang. See "Ref", "Table" etc

## binding & destructuring

unrefutable binding in destructuring:

- `let [x: x] := [x: 1 y: 2]` field destructuring
- `let [{long name}: x] := ...` field with space in name
- `let [x] := [x: 1 y: 2]` punning
- `let [x y] := [x: 1 y: 2]` punning multiple fields
  - note: `[x y: value]` is `[x: x y: value]`, not `[{x y}: value]`
- `let [x: [a]] := [x: [a: 1 b: 2]]` nesting
  - `let [x _x_: [a]] := ...` parent and child
  - `let [x] _frame_ := ...` ditto
- `let [magnitude: m] := Point{x: 1 y: 2}` 0-arg methods/"getters"
- `let [{slice: 1 to: 3}: slice] := Vec(...)` 1+arg methods

TODO: "if let"

## Types

Interface types are described with a syntax that matches frames:

- `[x: Num y: Num]` will accept any value that has `{x}:Num` and `{y}:Num` fields/methods
- `[]` will accept any value (but you can't do anything with it -- maybe useful as a free type constraint, only type for returning unit)
- `[{x: Num}: Num]` will accept any value that has an `{x: Num}: Num` method

When a cluster is used as a type, an implicit conversion is done on the type:
When a struct or enum cluster is used as a method parameter type, the conversion constructs an instance using the argument value. Given a cluster:

```
cluster Point is
* record {x: Num y: Num}

* constructor {origin} is ...
```

A `Point` method parameter type will accept:

- an instance of Point
- a record with the shape `[x: Num y: Num]`, which is used as `Point{x: arg{x} y: arg{y}}`
- a record with the shape `[empty]`, which is used as `Point{empty}`

When an interface cluster is used as a method parameter type, the conversion constructs an instance of the interface cluster around the concrete cluster. Given a cluster:

```
cluster Keyable{Key: Hashable Value: []} is
  interface
* expect {get: Key}: Value

* method {keys}: Set{Item: Key} is ...
```

A `Keyable` method parameter will accept any value with a `{get: Key}: Value` method & produce an instance of Keyable (e.g. with a `{keys}` method, without the argument's other fields)

### Protocol details

This is handled by the interaction of the methods `{of: _}: _` and `{apply: _}: _`.

Framelike cluster:

```
cluster Frame_x is:
* record {x: Num}

  // note: apply is not implemented if frame has non-field methods
* method {apply _Bar Module_: _}: _ is
    _Bar Module_{x: self{x}}
```

Interface cluster:

```
cluster Keyable{Key: Hashable Value: []} is
  struct
  field interface: [{get: Key}: Value]

* constructor {of _bar instance_: _} is
    Keyable{interface: _bar instance_}

* method {get: Key}: Value is
    self{interface}{get: Key}

  // does not implement apply
```

Concrete cluster:

```
cluster Bar is:
* constructor {of _foo instance_: _} is
    _foo instance_{apply: Bar}

* method {apply: _}: Bar is
    self

* method {foo: Num}: Num is ...
```

A frame used as a mock of a cluster instance

```
[
  {apply: _}:
    me

  {foo: value}:
    ...
]
```

### Type parameters

- `Vec{Item: Num}` `Map{Key: String Value: Bool}` in type expressions
- `type Vec{Item: []} is ...` in definitions
- `type Map{Key: Hashable Value: []} is ...` with constraints

# Clusters

In Goblin, programs are organized into _clusters_. Clusters are a bit like "modules", "classes" or "traits" in other languages.

Like modules, clusters organize & encapsulate code. Every file is a cluster, and can contain imports, type aliases, values, methods and other clusters. These can be private or public.

Like OOP classes, clusters can be instantiated and are themselves a both a type and a value. Instance methods can also be private or public.

Like traits or typeclasses, clusters provide additional behaviors to values that implement a baseline of behavior.

## Visibility

TODO: visibility syntax -- `*` in margin

## use

`use` declares a dependency on another cluster.

`use Math` `use Vec as V`

TODO: name resolution, nested clusters etc

## type alias

`type alias` creates a shorthand for another type without converting or adding additional behavior.

## framework

`use framework Foo`; at most one per cluster

frameworks affect the syntax within a cluster:

- define new statement-level keywords (eg control-flow syntax)
- define new cluster behaviors & auto-generated methods (ie. how `record` defines constructor, fields, methods, conversions)
- create dynamic scoped variables (like `self`)
- construct anonymous frame clusters (ie. implement the methods available to all frames defined in a cluster)

## cluster-level methods

TODO: pick a better keyword

- `c {pi}: Num is 3.1415927` constant
- `c {sine: Num}: Num is ...` helper function
- `c {x: Num y: Num}: Point is ...` constructor

## instance

`constructor` keyword allows the creation of fields & creates a constructor that matches the field names. `* constructor` makes the constructor public

`field name : type` or `field name := expr` creates an instance variable. These variables are in scope in instance methods.
`* field ...` for generating public getters & setters
`i {name: type}: type` for instance methods

## type params

`type field Key: Hashable` for type parameters with constraints

---

### Cluster methods

### Instances

A couple of different ways to create instances

make default constructor with all fields & fields with separate visibility modifiers for get / set

```
cluster Foo is
* struct // generates a constructor for fields, e.g. `{x: Num y: Num}`
+ field {x}: Num // `+` is public get, `-` is public set, `*` is both?
  field {y}: Num
```

default constructor, getters, setters, interfaces etc with identical visibility

```
cluster Bar is
* record {x: Num y: Num}
```

enum, constructors for each case, `apply` for pattern matching, per-case method impls

```
cluster List is
  enum
  case {nil} is
  * method {length} is 0
  case {head: T tail: List{Item: T}} is
  * method {length} is Num(1 + tail{length})
```

interfaces

```
cluster Hashable is
  interface
  * expect {hash}: String
```

## Errors

no throw/catch, errors are process-level

## Effects

While Goblin has a limited form of mutability in bindings, this does not introduce _shared_ mutable state. To share state, use refs:

```
cluster Foo is
  eff method {example}: Num is
    let value := eff Ref{of: 1}
    let shared = [x: value]

    value{update: [++]}
    value // value = <Ref>
    let result := eff value{current} // result = 2
```

Here, updating the value on `value` also updates the value on `shared{x}`.

Any method can _create_ side effects (e.g. call `value{update: [++]}`), but only `eff` methods can _observe_ side effects (e.g. read `value`).

`eff` propagates, such that to get the result of `example` is also an effect.

Synchronizing between concurrent processes is also done through the effect system

`read` will propagate an error; use `try read` or something to get a `[ok: result] | [error: message]`

constructing an effectful value is itself effectful
