export type IndentToken =
  | { tag: "newline" }
  | { tag: "indent" }
  | { tag: "dedent" }

export class Indent {
  private stack: string[] = [];
  *add(indent: string): Iterable<IndentToken> {
    indent = indent.replace(/\n/g, "")
    const currentIndent = this.stack.at(-1) ?? ""
    if (indent === currentIndent) {
      yield { tag: "newline" }
      return
    }
    if (indent.startsWith(currentIndent)) {
      this.stack.push(indent)
      yield { tag: "indent" }
      return
    }

    while (this.stack.pop()) {
      yield { tag: "dedent" }
      const currentIndent = this.stack.at(-1) ?? ""
      if (currentIndent === indent) return
    }
    throw new Error("invalid indent")
  }
  *clear(): Iterable<IndentToken> {
    for (let i = 1; i < this.stack.length; i++) {
      yield { tag: "dedent" }
    }
  }
}
