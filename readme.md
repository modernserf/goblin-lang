# More pattern-matching / method-dispatch features

## optional (as in Option type) / "nullable" handler args

This one seems more 'clever' than useful

```goblin
let Foo := [
	on {x: x y: ?y}
		# ...
]
# becomes
let Foo := [
	on {x: x}
		let y := Option{none}
		# ...
	on {x: x y: y}
		let y := Option{some: y}
		# ...
	on {x: x y?: y}
		# ...
]
```

## refutable patterns in bindings

- Patterns with same selector must be grouped together
- checked in order using `=`
- irrefutable binding should be last in sequence
- use parens to distinguish between bindings & exprs when ambiguous

```goblin
value{:
	do {count: 0}
		"No items"
	do {count: 1}
		"1 item"
	do {count: n}
		n{to String} ++ " items"
}
# becomes
value{
	do {count: n}
		if n = 0 then
			"No items"
		else if n = 1 then
			"1 item"
		else
			n{to String} ++ " items"
		end
}
```

## fuzzy matching

- Checked with `~=` instead of `=`

```goblin
value{:
	do {item: Range{from: 1 to: 10} as x}
		x
	do {item: x}
		"many items"
}
# becomes
value{
	do {item: x}
		if Range{from: 1 to: 10} ~= x then
			x
		else
		 	"many items"
		end
}
```

# nested patterns / exact destructuring

basically matching in reverse

If this is 'normal' destructuring...

```goblin
let [x: x y: y] := foo{bar}
# becomes
let _$1_ := foo{bar}
let x := _$1_{x}
let y := _$1_{y}
```

Then how about...

```goblin
let {x: x y: y} := foo{bar}
# becomes (approximately)
var _$1_ := []
foo{bar}{:
	on {x: x' y: y'}
		set _$1_ := [x: x y: y]
}
let [x: x y: y] := _$1_
```

This, combined with pattern matching, gets you something like

```goblin
pair{:
	on {0: {some: l} 1: {some: r}}
		# ...
	on {0: {some: l} 1: {none}}
		# ...
	on {0: {none} 	 1: {some: r}}
		# ...
	on {0: {none} 	 1: {none}}
		# ...
}
```

# reflection / oop features

I am sort of philosophically opposed to these; part of the 'joke' of this language is that its a very pedantic functional language that is merely disguised as a loose OOP one

`else` on its own gets you a surprising way there if you're willing to distinguish between direct & indirect sends

```goblin
let obj := [
	do {: msg}
		msg{:
			do {known method}
				# ...
			else
				delegate{: msg}
		}
]
```

## inheritance / mixins / traits

I could probably come up with a weird take on this

## conditional sends

check if an object responds to a message before sending it

One _specific, limited_ implementation of this that might be nice would be something like "optional params" for do-patterns

```goblin
let Vec := [
	on {map: do f}
		# ...
		f{: val ?index: i}
]
```

works with either `list{map: {: val} ...}` or `list{map: {: val index: i} ...}`
seems not all that worthwhile, especially vs `list{map: {: val} ...}` & `list{map index: {: val index: i} ...}`

## more else handlers

```goblin
let obj := [
	on {foo}
		#...
	else {: msg}
		# `msg` is frame of orignal message
		msg{: delegate}
		# ...
]
```
