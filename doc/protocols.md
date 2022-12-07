# Protocols

Goblin is a dynamically-typed langauge, and as such the interactions between objects are not governed by their types, but by the messages to which they respond. As such, many different kinds of objects will respond to the same messages

## `{}` (the empty message)

Construct an empty collection: `Vec{}`, `Array{}`

Execute a do-pattern without arguments: `Control{loop: {} ...}`

## `{: value}`

There are two distinct use-cases for this.

For objects that mostly _produce_ values, this is a 1-argument constructor:

```goblin
Option{: value} # => shorthand for Option{some: value}
let f := [{: value} value + 1]
vec{map: f}
```

For objects that are _themselves_ values, this sends the object's value as a message:

```goblin
let f := [x: 1 y: 2]
f{: Point} # => Point{x: 1 y: 2}
```

This is typically used for pattern matching, and as such these accept a do-pattern as the argument:

```goblin
let opt := Option{some: value}
let result := opt{:
  on {some: value} value
  on {none} 0
}
```

This can be also be leveraged as a shorthand syntax with frames:

```goblin
let xs := Vec{}, 1, 2, 3
xs{map: [-]} # => Vec{}, -1, -2, -3
xs{map: [*: 2]} # => Vec{}, 2, 4, 6
```

## `=` `!=` strict equality

## `==` `!==` equality with conversion

1 != 1.0, but 1 == 1.0

## `{to String}`, `{to Option}` explicit conversion

## `,` add an item to a collection

```goblin
Vec{}, 1, 2, 3
```

## `++` concatenate

## `{hash: hasher}` get hash code

## `{map: do f}` `{filter: do f}` `{chain: do f}`
