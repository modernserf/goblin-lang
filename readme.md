# Goblin

> my programming language brainworm is trying to get me to design a syntax that makes people as angry as Lisp does, but in a wholly original way, and without making the syntax intentionally obtuse or verbose
>
> https://twitter.com/modernserf/status/1524117731326533632

Goblin is a programming language unconstrained by paradigm or taste.

# Syntax Basics

Unlike most programming languages, Goblin's syntax is designed for rich text formatting & proportional-width fonts. Whitespace is not significant but encouraged.

<!-- TODO: more example here, maybe figure out linebreak situation -->

> let _a_ := "Hello" **assign "Hello" to _a_**
>
> Console{ log: _a_ ++ ", World" } **print "Hello, World" to console**

## Comments

Comments are written in **boldface**, or using `**double asterisks**` in plain text.

> **This is a comment**

```
**This is a comment**
```

## Number literals

Decimal, hex, binary literals, `_` separators, prefix `-`, exponents, (are fraction literals needed anymore?)

## String literals

String literals are written between double quotes, and may contain newlines.

> "Alice says \\"hello\\" to Bob"

## Identifiers & assignment

Identifiers are written in _italics_, or using `_underscores_` in plain text. Whitespace in identifiers is normalized such that `_foo bar_` and `_foo bar_` refer to the same identifier & are rendered identically in rich text.

Values can be assigned to identifiers with "let":

> let _x_ := 123

## Method calls

Call methods on values using curly braces. Some methods take no arguments:

> 123{negate}

Some methods take arguments, which can be provided in any order (though they are usually written to read best in one particular direction):

> Range{from: 1 through: 10}
>
> Range{through: 10 from: 1}

Method argument names can contain words, numbers, operators and whitespace. Whitespace is normalized just as it is in identifiers.

> "hello"{to uppercase}

Method arguments can be "punned":

> let _x_ := 1
>
> let _y_ := 2
>
> let _p_ := Point{ _x_ _y_ } **equivalent to Point{x: _x_ y: _y_}**

### Destructuring assignment

Method calls can be done in "let" bindings:

> let [x: _value_] := point **equivalent to let _value_ := point{x}**
>
> let [_x_] := point **equivalent to let _x_ := point{x}**
>
> let [{slice: 1 to: 3}: _slice_] := list ** equivalent to let _slice_ := list{slice: 1 to: 3}**

## Operators

When a method name consists of symbols, it can be called like a binary operator:

> 1 + 2 **equivalent to 1{+: 2}**

All operators have the same precedence and are evaluated left to right. Braced method calls have higher precedence than operators:

> _foo_{x} + _bar_{y} + _baz_{z}
>
> **equivalent to _foo_{x}{+: _bar_{y} }{+: _baz_{z}}**

## Clusters

Goblin programs are organized into clusters. Clusters are conceptually similar to modules or classes in other programming languages. Cluster names always begin with an uppercase letter. Clusters have methods (and operators) like other values. The methods on clusters typically construct instances of the cluster.

> Number{pi}
>
> Range{from: 1 through: 10}
>
> Vec , 1 , 2 , 3 ++ _more_

## Frames

Frames are the basic composite data structure. They use similar syntax as method calls, but with square brackets. A frame can be just a symbol:

> [none]

Or they can be key-value structures:

> [x: 1 y: 2]

Frame fields can be "punned" just like method arguments:

> let _x_ := 1
>
> let _y_ := 2
>
> let _p_ := [_x_ _y_] **equivalent to [x: _x_ y: _y_]**

### Frame field methods

Frames have a number of methods defined on them. Frames with key-value pairs will have get, set & update methods for each field:

> let _p_ := [x: 1 y: 2]
>
> _p_{x} **=> 1**
>
> _p_{x: 3} **=> [x: 3 y: 2]**
>
> _p_{update x: with _x_ do _x_ + 2} **=> [x: 3 y: 2]**

### Apply

Frames also have a "." operator method (pronounced "apply") that takes a value and calls a method on that value that matches the frame, e.g.

> [pi].Number **equivalent to Number{pi}**
>
> [x: 1 y: 2].Point **equivalent to Point{x: 1 y: 2}**
>
> [to uppercase]."hello" **equivalent to "hello"{to uppercase}**

## Blocks

Unlike many languages, Goblin does not have for loops or if statements. Rather, it has methods that accept blocks:

> Range{from: 1 through: 10}{each: with _x_ do
>
> &nbsp;&nbsp;Console{log: _x_}
>
> }
>
> let _result_ := (_x_ > 3)
>
> &nbsp;&nbsp;{then: do "bigger"}
>
> &nbsp;&nbsp;{else if: _x_ = 3 then: do "equal"}
>
> &nbsp;&nbsp;{else: do "smaller"}

A block without arguments is "do ..." and with arguments is "with _arg_ do ..."

Using "return" in a block returns from the outer method, not within the block.

A block expression creates a value with a "." method, and you can call a block with ".":

<!-- TODO: should blocks be allowed in expressions, or _just_ in method arguments? How do I demonstrate a block being called inside a method? -->

> let _block_ := (with _x_ do _x_ + 1)
>
> _block_.3 **=> 4**

### Partial application

Methods that take blocks can also take frames (or any other value with a "." method). This can be used like:

> _points_{map: [x]} **get x values from a list of points**
>
> _scores_{filter: [<: 80]} **get scores < 80**

## Reassigning variables

Most values in Goblin are immutable, but variables can be reassigned. This allows for some imperative programming techniques that are rather tedious in purely functional languages. Reassignment is done with the "set" keyword.

> let _fizz counter_ := 0
>
> items{each: with _x_ do
>
> &nbsp;&nbsp;(_x_ % 3 = 0){then: do
>
> &nbsp;&nbsp;&nbsp;&nbsp;set _fizz counter_ = _fizz counter_ + 1
>
> &nbsp;&nbsp;}
>
> }

set can also be used directly on method calls if the receiver is an identifier:

> set _point_{x: 3} **equivalent to set _point_ := _point_{x: 3}**

Note that this does not mutate _point_, it creates a new frame from the old one & assigns it to the same name. Copies will be unchanged:

> let _point_ := [x: 1 y: 2]
>
> let _other_ := _point_
>
> set _point_{x: 3} **_other_ is still [x: 1 y: 2]**

Also note that setting a frame's field cannot create a recursive frame; if you set a frame's field to itself, it will receive the _previous_ value of the frame:

> let _point_ := [x: 1 y: 2]
>
> set _point_{x: _point_} **_point_ is [x: [x: 1 y: 2] y: 2]**

Some methods will have "set" arguments that work a bit like `inout`, `var` or `mut` arguments in other languages. This is often used for methods that would both return a value & mutate their receiver:

> let _vec_ := Vec, 1, 2, 3
>
> let _popped_ := Vec{pop: set _vec_} **_popped_ is 3, _vec_ is (Vec, 1, 2)**

## Closures

Closures are like blocks, with both fewer abilities & fewer restrictions:

- closures can be used anywhere a value is used (e.g. assigned to a variable, returned from a method, stored in another value), but blocks can only be defined as method arguments & called in that method.
- blocks can set variables defined outside the block, but closures cannot
- "return" in a block returns from the outer method; "return" in a closure just returns from the closure
- any method that accepts a block will also accept a closure

Closures use this syntax:

> [._arg_ is _arg_ + 1]

Like blocks, closure literals can have multiple arguments, which are equivalent to nested closures:

> [._foo_ _bar_ is _foo_ + _bar_]

> **equivalent to [._foo_ is [._bar_ is _foo_ + _bar_]]**

# Clusters

The cluster is the powerhouse of the cell

## Defining methods

- types
- set params
- inline block params
- pub

## Instances

- self
- struct { x: Num y: Num }
- custom constructors

## Enums & pattern matching

- case constructors
- pattern matching
- Partially applied constructors

## Type parameters

## Interfaces

## Context & providers

## Module system / use

# Effects & Processes

## Methods with effects

## Mutable values

## Processes

## Errors
