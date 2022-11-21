# Introduction

Goblin is a postmodern take on a 90s scripting language. It features:

- dynamic types
- immutable by default
- lightweight objects, without classes or inheritance
- pattern matching
- novel syntax

Goblin is "research language" in the sense that it is really more intended to be an object of study and discussion, rather than a tool one uses to actually make software. But it is a real language with an implementation that does more or less everything that is described in this document.

# Core concepts & guiding philosophy

## Objects for everything

Where other languages would use a function, Goblin uses an object with one handler. Where other languages would use a class, Goblin uses an object with a handler that produces another object.

Where other languages would use a `switch` or `match` statement, Goblin uses an object with handlers for each match case. Goblin message handlers support most of the pattern matching features one has come to expect from functional languages.

Control flow is also object-y: Goblin uses special control-flow capturing objects (similar to Ruby's blocks) where other languages use loops & conditionals.

# Language overview

Literals for numbers & strings, like you would expect.

```goblin
1 							# an integer
1.0 						# a float
"Hello, world!" # a string
```

You can send values messages.

```goblin
"Hello, world!"{uppercase} # "HELLO, WORLD!"
```

Operators are syntactic sugar for sending messages.

```goblin
1 + 2 	# 1{+: 2}
-1 			# 1{-}
```

Bindings use `let`:

```goblin
let a := 1
let b := a + 2 # 3
```

Objects are collections of handlers that can receive messages:

```goblin
let point := [
	on {x} 1
	on {y} 2
]

point{x} + point{y} # 3
```

Frames are a shorthand for creating objects with getters, setters, updaters & and pattern matching:

```goblin
let a := [x: 1 y: 2]
a{x} # 1
let b := a{x: 2} # [x: 2 y: 2]

let update := [
	on {: value} value + 1
]
let c := a{->y: update} # [x: 1 y: 3]

let pattern := [
	on {x: x y: y}
		x + y
	on {x: x y: y z: z}
		x + y + z
]

a{:pattern} # 3
```
