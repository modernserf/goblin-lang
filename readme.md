# Introduction

Goblin is a postmodern take on a 90s scripting language. It features:

- dynamic types
- immutable by default
- lightweight objects, without classes or inheritance
- pattern matching
- novel syntax

Goblin is "research language" in the sense that it is really more intended to be an object of study and discussion, rather than a tool one uses to actually make software. But it is a real language with an implementation that does more or less everything that is described in this document.

# Language overview

Literals for numbers & strings:

```goblin
1 							# an integer
1.0 						# a float
"Hello, world!" # a string
```

Send messages to values:

```goblin
"Hello, world!"{uppercase} # => "HELLO, WORLD!"
"Hello, world!"{from: 0 to: 5} # => "Hello"
```

Operators are syntactic sugar for sending messages. (TODO: short explanation of operator precedence)

```goblin
1 + 2 	# 1{+: 2}
-1 			# 1{-}
```

`let` bindings & identfiers:

```goblin
let a := 1
let _a long identifier name_ := 2
```

(TODO: link to more on bindings: destructuring, placeholders, etc)

`do` expressions:

```goblin
let a := do
	let b := 1
	let c	:= 2
	b + c
end # => 3
```

`if` expressions:

```goblin
let result := if count = 0 then
	"no items"
else if count = 1 then
	"1 item"
else
	count{to String} ++ " items"
end
```

## Objects

Objects are collections of message handlers:

```goblin
let greetings := [
	on {hello}
		"Hello!"
	on {hello: name}
		"Hello, " ++ name ++ "!"
	on {hello twice}
		self{hello} ++ " " ++ self{hello}
]

greetings{hello} # => "Hello!"
greetings{hello: "world"} # => "Hello, world!"
greetings{hello twice} # => "Hello! Hello!"
```

Handlers return the value of their final expression, but you can `return` early:

```goblin
let obj := [
	on {results: results}
		if results{length} = 0 then
			return "no results"
		end
		results{map: {: result} result{name}}{join: ", "}
]
```

There are no "classes" in Goblin; instead, we use objects that construct other objects:

```goblin
let Point := [
	on {x: x y: y} [
		on {x} x
		on {y} y
		on {manhattan distance: other}
			(x - other{x}){abs} + (y - other{y}){abs}
	]
]

let origin := Point{x: 0 y: 0}
let point := Point{x: 1 y: 2}
point{manhattan distance: origin} # => 3
```

Most values in Goblin are immutable; "setters" instead return a new value:

```goblin
let Point := [
	on {x: x y: y} [
		on {x} x
		on {y} y
		on {x: x'}
			Point{x: x' y: y}
		on {y: y'}
			Point{x: x y: y'}
	]
]
let a := Point{x: 1 y: 2}
let b := a{y: 3} # => Point{x: 1 y: 3}
```

There are no "functions" in Goblin; instead, we use objects with a single handler.

```goblin
import [_Vec_] := "core"
let items := Vec{}, 1, 2, 3
let mapper := [
	on {: value}
		value * 2
]
let mapped := items{map: mapper} # => Vec{}, 2, 4, 6
```

When an object has only one handler, we can elide the `on`:

```goblin
let mapped := items{map: [{: value} value * 2]}
```

There is no "pattern matching" in Goblin, either; instead, we send a pattern object to a receiver object, and the receiver then sends a message to the pattern object:

```goblin
let Option := [
	on {some: value} [
		on {: pattern}
			pattern{some: value}
	]
	on {none} [
		on {: pattern}
			pattern{none}
	]
]
let pattern := [
	on {some: value}
		value
	on {none}
		0
]
let a := Option{some: 5}
a{: pattern} # => 5
let b := Option{none}
b{: pattern} # => 0
```

objects can be "destructured" in `let` bindings:

```goblin
let [x: x y: y] := Point{x: 1 y: 2}
# equivalent to
# let temp := Point{x: 1 y: 2}
# let x := temp{x}
# let y := temp{y}
```

(TODO: link to more on objects & pattern matching)

## Frames

Frames are a shorthand for creating simple objects with common behaviors:

```goblin
let a := [x: 1 y: 2]
a = [x: 1 y: 2] # => true
a{x} # => 1
a{x: 2} # => [x: 2 y: 2]
a{->y: [{: value} value + 1]} #  => [x: 1 y: 3]
a{:[
	on {x: x y: y}
		x + y
	on {x: x y: y z: z}
		x + y + z
]} # => 3
```

A common idiom with frames is to use them in "higher-order messages", like map/filter:

```goblin
let points := Vec{}, Point{x: 1 y: 2}, Point{x: 3 y: 4}
points{map: [x]} # points{map: [{: value} value{x}]}
let nums := Vec{}, 1, 2, 3
nums{filter: [<=: 2]} # nums{filter: [{: value} value <= 2]}
```

The expression `[]` produces a frame with a blank key; for an object with _no_ methods, use `()`.

(TODO: link to more on frames)

## Vars

`var` creates a binding that can be reassigned using `set`. Only the _binding_ is mutable; the value associated with the binding is immutable, and accessing a `var` binding gets its current value:

```goblin
var x := 1
let a := x # => 1
set x := 2
let b := x # a = 1, b = 2
```

There is a shorthand for setting a variable "in place":

```goblin
var p := [x: 1 y: 2]
set p{y: 3} # set p = p{y: 3}
```

Var bindings cannot be closed over by objects:

```goblin
var x := 1
let a := x
let obj := [
	on {foo}
		set x := 2 		 # compile error
		let value := x # compile error
		let value := a # ok
]
```

Handlers can take `var` parameters:

```goblin
var x := 1
let obj := [
	on {inc: var counter}
		set counter := counter + 1
]
obj{inc: var x} # x = 2

```

## do blocks

A `do` block is an object that uses its parent context instead of creating its own. For example:

- `self` refers to the outer object
- `return` returns from the outer handler
- `var` bindings in the outer handler can be accessed and `set`

Do blocks are written as objects without brackets, and are typically used for pattern matching, or where other languages would use anonymous functions. However, the increased flexibility for the sender has corresponding restrictions on the receiver:

- `do` parameters must be annotated
- a `do` parameter cannot be stored or returned; only sent a message or sent _in_ another message

```goblin
let List := [
	on {nil} [
		on {: do match}
			match{nil}
		on {map: do f}
			self
	]
	on {head: h tail: t} [
		on {: do match}
			match{head: h tail: t}
		on {map: do f}
			let h' := f{: h}
			let t' := t{map: f}
			List{head: h' tail: t'}
	]
]

let obj := [
	on {find: item in: list}
		list{:
			on {nil}
				return [not found]
			on {head: h tail: t}
				if h = item then
					return [ok]
				end
				return obj{find: item in: t}
		}
	on {sum: list}
		var sum := 0
		list{map: {: item}
			set sum{+: item}
		}
		sum
]
```

## provide & use

There are no global variables in Goblin -- even `true` and `false` must be imported from the core library. However, pervasive access to global resources (eg. the current time, logging) or application context (eg. the current user) is often desirable. Goblin enables both of these with `provide` and `using`, which propagate and access values via dynamic scope:

```goblin
let log := [
	on {: message}
		using {logger: l}
		l{: message}
]
let mock_logger := [
	on {: message}
		# drop messages
		()
]

log{: "hello"} # logs to system logger
do
	provide{logger: mock_logger}
	log{: "hello"} # logs to mock_logger
end
log{: "goodbye"} # back to system logger
```

(TO IMPLEMENT: provide/using vars & do blocks, clearing context, module-level context allowlists)

## error handling & control flow

`defer` executes after a handler returns or encounters a runtime error. This is most useful for managing constrained system resources, e.g. file handles:

```goblin
import [_os_] := "core"
let file := [
	on {with: path do: do block}
		let handle := os{open: path}
		defer
			handle{close}
		end
		block{: handle}
]
```

the try-send operator `?` allows for a default value if an object does not handle a message:

```goblin
let defaults := [x: 1 y: 2]
let params := [x: 3]
let x := params{x} ? defaults{x} # => 3
let y := params{y} ? defaults{y} # => 2
```

This is idiomatically used with `do` blocks to provide optional arguments:

```goblin
let List := [
	# ...
	on {head: h tail: t} [
		on {map: do f}
			self{map: f index: 0}
		on {map: do f index: i}
			let h' := f{: h index: i} ? f{: h}
			let t' := tail{map: f index: i + 1}
			List{head: h' tail: t'}
	]
]
# both work:
list{map: {: item index: i} i}
list{map: {: item} item}
```

This is also idiomatically used for unwrapping optionals and propagating errors:

```goblin
let Opt := [
	on {some: value} [
		on {some}
			value
	]
	on {none} [
		# no 'some' handler
	]
]

let obj := [{: opt_value}
	let value := opt_value{some} ? do return Opt{none} end
	# do stuff with value
]
```
