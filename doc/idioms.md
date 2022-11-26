# Goblin idioms

One of my goals with this language was to develop a syntax that did not have a lot of forms or keywords, but the forms that it _did_ have composed into compact and useful idioms.

# The `:` message

The blank message with one argument, `:`, is used pervasively:

- on class-like objects, its the default, 1-argument constructor
- on instance-like objects, including frames, its used for pattern matching
- its the message sent to closure-like objects by many "higher-order handlers" like map/filter etc

These can interact together in useful ways:

## "Upgrade" a frame to a custom type

```goblin
# module.gob
let PrivateOptions := [
  on {foo: x} [
    # ...
  ]
  on {bar} [
    # ...
  ]
]

export let PublicClass := [
  on {value: v options: opts}
    let opts := opts{: PrivateOptions}
    # ...
]

# app.gob
import [_PublicClass_] := "/module.gob"
let item := PublicClass{value: 1 options: [foo: 2]}
```

## Frames as partially applied functions

```goblin
let points := Vec{}, Point{x: 1 y: 2}, Point{x: 3 y: 4}
points{map: [x]} # points{map: {: value} value{x}}
let nums := Vec{}, 1, 2, 3
nums{filter: [<=: 2]} # nums{filter: {: value} value <= 2}
```

# Try-send

## Optional arguments for do blocks

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

## Pseudo error propagation

```goblin
let Opt := [
	on {some: value} [
		on {some!}
			value
	]
	on {none} [
		# no 'some!' handler
	]
]

let obj := [{: opt_value}
	let value := opt_value{some!} ? (return Opt{none})
	# do stuff with value
]
```
