class ParseError {
  ok = false as const
  constructor(public expected: any = null, public received: any = null) {}
}

type Result<T> = ParseResult<T> | ParseError

class ParseResult<T> {
  ok = true as const
  constructor(public state: ParseState, public match: T) {}
}

class ParseState {
  constructor(private str: string, public index: number = 0) {}
  match(re: RegExp): Result<string> {
    re.lastIndex = this.index
    const result = re.exec(this.str)
    if (result) {
      return new ParseResult(new ParseState(this.str, re.lastIndex), result[0])
    }
    return new ParseError(re, this.str.substr(this.index, 10))
  }
  done(): boolean {
    return this.index === this.str.length
  }
}

export abstract class Parser<T> {
  parseString(str: string): T {
    const result = this.parse(new ParseState(str, 0))
    if (!result.ok) throw result
    if (!result.state.done())
      throw new ParseError("end of input", str.substr(result.state.index, 10))
    return result.match
  }
  abstract parse(p: ParseState): Result<T>
  fail(): Parser<unknown> {
    return new Fail(this)
  }
  or<U>(other: Parser<U>): Parser<T | U> {
    return new Alt<T | U>([this, other])
  }
  seq<U>(next: Parser<U>): Parser<[T, U]> {
    return new Seq(this, next)
  }
  then<U>(next: Parser<U>): Parser<U> {
    return new PMap(new Seq(this, next), ([_, next]) => next)
  }
  skip(next: Parser<unknown>): Parser<T> {
    return new PMap(new Seq(this, next), ([first]) => first)
  }
  map<U>(fn: (t: T) => U): Parser<U> {
    return new PMap(this, fn)
  }
  map2<U, V>(next: Parser<U>, fn: (t: T, u: U) => V): Parser<V> {
    return new PMap(new Seq(this, next), ([t, u]) => fn(t, u))
  }
  map3<U, V, W>(
    u: Parser<U>,
    v: Parser<V>,
    fn: (t: T, u: U, v: V) => W
  ): Parser<W> {
    return new PMap(new Seq(this, new Seq(u, v)), ([t, [u, v]]) => fn(t, u, v))
  }
  repeat(): Parser<T[]> {
    return new Repeat(this)
  }
  repeat1(): Parser<T[]> {
    return new PMap(new Seq(this, new Repeat(this)), ([first, rest]) =>
      [first].concat(rest)
    )
  }
  opt(): Parser<T | null> {
    return new Option(this)
  }
}

export class Fail extends Parser<unknown> {
  constructor(private parser: Parser<unknown>) {
    super()
  }
  parse(p: ParseState) {
    if (this.parser.parse(p).ok) {
      return new ParseError("fail")
    }
    return new ParseResult(p, null)
  }
}

export class Match extends Parser<string> {
  constructor(private re: RegExp) {
    re = new RegExp(re, "uy")
    super()
  }
  parse(p: ParseState) {
    return p.match(this.re)
  }
}

class PMap<T, U> extends Parser<U> {
  constructor(private parser: Parser<T>, private fn: (t: T) => U) {
    super()
  }
  parse(p: ParseState) {
    const res = this.parser.parse(p)
    if (!res.ok) return res
    return new ParseResult(res.state, this.fn(res.match))
  }
}

class Repeat<T> extends Parser<T[]> {
  constructor(private parser: Parser<T>) {
    super()
  }
  parse(p: ParseState) {
    const results: T[] = []
    while (true) {
      const res = this.parser.parse(p)
      if (res.ok) {
        if (res.state.index === p.index) {
          throw new Error("repeat stuck")
        }
        p = res.state
        results.push(res.match)
      } else {
        return new ParseResult(p, results)
      }
    }
  }
}

class Seq<L, R> extends Parser<[L, R]> {
  constructor(private left: Parser<L>, private right: Parser<R>) {
    super()
  }
  parse(p: ParseState) {
    const left = this.left.parse(p)
    if (!left.ok) return left
    const right = this.right.parse(left.state)
    if (!right.ok) return right
    return new ParseResult<[L, R]>(right.state, [left.match, right.match])
  }
}

export class Alt<T> extends Parser<T> {
  constructor(private alts: Array<Parser<T>>) {
    super()
  }
  parse(p: ParseState) {
    for (const parser of this.alts) {
      const res = parser.parse(p)
      if (res.ok) return res
    }
    return new ParseError("alt")
  }
}

class Option<T> extends Parser<T | null> {
  constructor(private parser: Parser<T>) {
    super()
  }
  parse(p: ParseState) {
    const res = this.parser.parse(p)
    if (res.ok) return res
    return new ParseResult(p, null)
  }
}

export class Defer<T> extends Parser<T> {
  private parser!: Parser<T>
  constructor(private getParser: () => Parser<T>) {
    super()
  }
  parse(p: ParseState) {
    this.parser ??= this.getParser()
    return this.parser.parse(p)
  }
}
