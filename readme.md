# goblin update

I've been working on actually implementing Goblin over the last couple of weeks, and in the process I've simplified the design a bit.

# Philosophy

## Type discipline

Goblin uses dynamic types, but avoids automatic type conversion or coercion. Runtime errors are preferred over

# Basics

```goblin
# line comments
let foo := "a string"
let number := 2_000_000.123

# simple identifiers
foo bar123 x x' x''
# identifiers 'quoted' with underscores
_some words_ _a sentence, with punctuation even!_
```

# Messages

```goblin
# sending a message with no arguments
point{x}
# messages can have whitespace, numbers, symbols in their names
"Hello, world"{to uppercase}
# messages with arguments are key: value pairs
list{push: value}
Range{from: min to: max}
# message arguments can be sent in any order
Range{to: max from: min}
# messages can be blank, or have a blank key
Map{}
fn{: arg}

# operators are syntactic sugar for sending messages
-10 # => 10{-}
1 + 2 # => 1{+: 2}
# simple precedence rules:
# first sends, then unary operators, then binary operators
# always left-to-right
-foo{x} + bar{y}  # => foo{x}{-}{+: bar{y}}
```

# Objects

```goblin
# objects are values that respond to messages
let obj := [
	# objects are written as a series of methods that match a message
	# and run the following body of code
	{a method}
		# the last expression is returned implicitly
		1; # methods are separated by semicolons
	{key: value}
		# the receiving object can be referenced with 'self'
		value + self{a method}
]

# there are no classes in Goblin; instead, objects create other objects
let Point := [
	# Point{x: 1 y: 2} to construct a Point
	{x: x y: y} [
		# "getters"
		{x} x;
		{y} y;
		# objects are immutable by default; "setters" construct new objects
		{x: x'} Point{x: x' y: y};
		{y: y'} Point{x: x y: y'};
		# "instance methods"
		{manhattan distance: other}
			(x - other{x}){abs} + (y - other{y}){abs};
	];
	# "static methods"
	{origin}
		Point{x: 0 y: 0};
]
```

# enums, higher order functions, pattern matching

```goblin
let Option := [
	{some: value} [
		# higher order functions: opt{map: [{: x} x + 1]}
		{map: f}
			Option{some: f{: value}};
		# pattern matching: opt{: [{some: x} x; {none} 0]}
		{: pattern}
			pattern{some: value};
	];
	{none} [
		{map: f}
			self;
		{: pattern}
			pattern{none};
	];
]
```

---

syntactic sugar ideas

# if expressions

because pattern matching alone can get really tedious

```
if <expr> then <body> (else if <expr> then <body>)* (else <body>) end

if foo then bar end =>
foo{:
  {true} bar;
  {false};
}

if foo then bar else baz end =>
foo{:
  {true} bar;
  {false} baz;
}

if foo then bar else if baz then quux else xyzzy end =>
foo{:
  {true} bar;
  {false} baz{:
    {true} quux;
    {false} xyzzy;
  }
}
```

# pipeline meta-operator

same precedence as call expr
useful for conversions, avoids the desire for mixins / inheritance because left-to-right flow never needs to be broken

```
<baseExpr>::<baseExpr>

list::Iter{take: 3} => Iter{: list}{take: 3}
```

# do expression

Avoids some hideous syntax

```
do <body> end

let z := do
  let x := 1
  let y := 2
  x + y
end

let z := [{}
	let x := 1
	let y := 2
	x + y
]{}
```

# set & var paths

```
set x{y}{z} := a => set x := x{y: x{y}{z: a}}
set x{y}{z: a} => set x := x{y: x{y}{z: a}}

foo{x: var bar{y}}
=>
var bar_y := bar{y}
foo{x: var bar_y}
set bar := bar{y: bar_y}
```
