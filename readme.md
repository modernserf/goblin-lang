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

let z := []{:
  {}
    let x := 1
    let y := 2
    x + y
}
```

# set statements

"path" on left hand side

```
set x{y}{z} := a => set x := x{y: x{y}{z: a}}
set x{y}{z: a} => set x := x{y: x{y}{z: a}}

```
