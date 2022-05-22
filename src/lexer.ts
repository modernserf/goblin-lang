export type Token =
  | { tag: "end" }
  | { tag: "{" }
  | { tag: "}" }
  | { tag: "[" }
  | { tag: "]" }
  | { tag: "(" }
  | { tag: ")" }
  | { tag: ":" }
  | { tag: ":=" }
  | { tag: "number"; value: string }
  | { tag: "string"; value: string }
  | { tag: "identifier"; value: string }
  | { tag: "cluster"; value: string }
  | { tag: "keyword"; value: string }
  | { tag: "operator"; value: string }

type PatternMap<Tok> = Record<
  string,
  {
    pattern: RegExp
    map?: (s: string) => Tok
    ignore?: boolean
  }
>

const patterns: PatternMap<Token> = {
  // TODO: inline comments? maybe those only exist in the 'rich text' version
  comment: {
    pattern: /;[^\n]*/,
    ignore: true,
  },
  punctuation: {
    pattern: /:=|[{}()\[\]:]/,
    map: (value) => ({ tag: value } as Token),
  },
  // TODO: maybe these should all be distinct tokens
  hex: {
    pattern: /-?0x[0-9a-fA-F][0-9a-fA-F_]*/,
    map: (value) => ({ tag: "number", value }),
  },
  binary: {
    pattern: /-?0b[0-1][0-1_]*/,
    map: (value) => ({ tag: "number", value }),
  },
  // hmm: `-123.45/67e+89`
  decimal: {
    pattern:
      /-?[0-9][0-9_]*(?:\.[0-9][0-9_]*)?(?:\/[0-9][0-9_]*)?(?:[eE][+-]?[0-9][0-9_]*)?/,
    map: (value) => ({ tag: "number", value }),
  },
  string: {
    pattern: /"(?:\\"|[^"])*"/,
    map: (value) => ({ tag: "string", value: value.slice(1, -1) }),
  },
  identifier: {
    pattern: /_[^_]*_/,
    map: (value) => ({ tag: "identifier", value: value.slice(1, -1) }),
  },
  cluster: { pattern: /[A-Z][A-Za-z0-9_]*/ },
  keyword: { pattern: /[a-z]+/ },
  operator: { pattern: /[~!@#$%^&*-+=|.,?<>/]+/ },
  whitespace: { pattern: /[ \n\t]+/, ignore: true },
  error: { pattern: /./ },
}

function buildRe(patterns: PatternMap<unknown>): RegExp {
  return new RegExp(
    Object.entries(patterns)
      .map(([key, { pattern }]) => `(?<${key}>${pattern.source})`)
      .join("|"),
    "y"
  )
}

export function* lexer(text: string): Iterable<Token> {
  const re = buildRe(patterns)
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const g = match.groups || {}
    for (const key in patterns) {
      const value = g[key]
      const { map, ignore } = patterns[key]
      if (!value) continue

      if (ignore) {
      } else if (map) {
        yield map(value)
      } else {
        yield { tag: key, value: g[key] } as Token
      }
      break
    }
  }

  return { tag: "end" }
}
