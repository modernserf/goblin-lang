import { ASTArg, ASTBinding, ASTExpr, ASTStmt, ASTParam } from "./parser"

export type PrimitiveMethod = <Value>(value: any, args: Value[]) => Value

export type PrimitiveClass = Map<string, PrimitiveMethod>

const stringClass: PrimitiveClass = new Map([])
const intClass: PrimitiveClass = new Map([])

export type IRClass = Map<string, IRStmt[]>

export type IRExpr =
  | { tag: "local"; index: number }
  | { tag: "ivar"; index: number }
  | { tag: "self" }
  | { tag: "primitive"; class: PrimitiveClass; value: any }
  | { tag: "object"; class: IRClass; ivars: IRExpr[] }
  | { tag: "call"; selector: string; target: IRExpr; args: IRExpr[] }

export type IRStmt =
  | { tag: "let"; index: number; value: IRExpr }
  | { tag: "return"; value: IRExpr }
  | { tag: "expr"; value: IRExpr }

type ScopeRecord = { index: number }

class Instance {
  private ivarMap = new Map<string, ScopeRecord>()
  readonly ivars: IRExpr[] = []
  constructor(private parent: Scope) {}
  lookup(key: string): IRExpr {
    const found = this.ivarMap.get(key)
    if (found) return { tag: "ivar", index: found.index }

    const index = this.ivars.length
    this.ivars.push(this.parent.lookup(key))
    this.ivarMap.set(key, { index })
    return { tag: "ivar", index }
  }
  newScope(): Scope {
    return new Scope(this)
  }
}

export class Scope {
  private locals = new Map<string, ScopeRecord>()
  private localsIndex = 0
  constructor(private instance: Instance | null = null) {}
  lookup(key: string): IRExpr {
    const record = this.locals.get(key)
    if (record) return { tag: "local", index: record.index }
    if (!this.instance) {
      throw new Error(`unknown variable ${key}`)
    }
    return this.instance.lookup(key)
  }
  use(key: string): ScopeRecord {
    if (this.locals.has(key)) {
      throw new Error(`duplicate variable ${key}`)
    }
    const record = { index: this.localsIndex++ }
    this.locals.set(key, record)
    return record
  }
  useAnon(): ScopeRecord {
    const record = { index: this.localsIndex++ }
    return record
  }
  newInstance(): Instance {
    return new Instance(this)
  }
}

type ArgList =
  | { tag: "pairs"; selector: string; args: { key: string; value: IRExpr }[] }
  | { tag: "methods"; methods: { params: ASTParam[]; body: ASTStmt[] }[] }

// TODO:
// - check for duplicate method selectors / field names
// - replace blank fields with indexes
// - also do this in bindings
// - maybe this happens
function argList(compiler: Scope, args: ASTArg[]): ArgList {
  if (args.length === 0) {
    return { tag: "pairs", selector: "", args: [] }
  }
  if (args.length === 1 && args[0].tag === "key") {
    return { tag: "pairs", selector: args[0].key, args: [] }
  }
  const methods: { params: ASTParam[]; body: ASTStmt[] }[] = []
  const fields: { key: string; value: IRExpr }[] = []
  for (const arg of args) {
    switch (arg.tag) {
      case "key":
        throw new Error("key must be only field in object")
      case "method":
        if (fields.length) throw new Error("mixed methods and fields")
        methods.push(arg)
        break
      case "pair":
        if (methods.length) throw new Error("mixed methods and fields")
        fields.push({ key: arg.key, value: expr(compiler, arg.value) })
    }
  }
  if (methods.length) {
    return { tag: "methods", methods }
  }

  fields.sort((a, b) => a.key.localeCompare(b.key))
  return {
    tag: "pairs",
    selector: fields.map((f) => `${f.key}:`).join(""),
    args: fields,
  }
}

function objectParams(params: ASTParam[]): {
  selector: string
  bindings: ASTBinding[]
} {
  if (params.length === 0) return { selector: "", bindings: [] }
  if (params.length === 1 && params[0].tag === "key") {
    return { selector: params[0].key, bindings: [] }
  }

  const pairs: { key: string; value: ASTBinding }[] = []
  for (const param of params) {
    if (param.tag === "key") {
      throw new Error("mixed keys and pairs in method params")
    }
    pairs.push(param)
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key))
  const selector = pairs.map((p) => `${p.key}:`).join("")
  const bindings = pairs.map((p) => p.value)

  return { selector, bindings }
}

function object(
  parentCompiler: Scope,
  methods: { params: ASTParam[]; body: ASTStmt[] }[]
): IRExpr {
  const instance = parentCompiler.newInstance()
  const objectClass: IRClass = new Map()
  for (const method of methods) {
    const scope = instance.newScope()
    const { selector, bindings } = objectParams(method.params)
    const methodBody: IRStmt[] = []
    for (const bind of bindings) {
      switch (bind.tag) {
        case "identifier":
          scope.use(bind.value)
          break
        case "object": {
          const record = scope.useAnon()
          const local: IRExpr = { tag: "local", index: record.index }
          methodBody.push(...letStmt(scope, bind, local))
        }
      }
    }

    methodBody.push(...body(scope, method.body))
    objectClass.set(selector, methodBody)
  }
  return { tag: "object", class: objectClass, ivars: instance.ivars }
}

const frameCache = new Map<string, IRClass>()
function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return { tag: "object", ivars, class: cachedClass }

  const frameClass: IRClass = new Map()
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
  frameClass.set(selector, [
    {
      tag: "return",
      value: {
        tag: "object",
        class: frameClass,
        ivars: args.map((_, index) => ({ tag: "local", index })),
      },
    },
  ])
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.set(":", [
    {
      tag: "return",
      value: {
        tag: "call",
        selector: selector,
        target: { tag: "local", index: 0 },
        args: args.map((_, index) => ({ tag: "ivar", index })),
      },
    } as IRStmt,
  ])
  for (const [index, { key }] of args.entries()) {
    // getter: [x: 1 y: 2]{x}
    frameClass.set(key, [{ tag: "return", value: { tag: "ivar", index } }])
    // setter: [x: 1 y: 2]{x: 3}
    frameClass.set(`${key}:`, [
      {
        tag: "return",
        value: {
          tag: "object",
          class: frameClass,
          ivars: args.map((_, j) => {
            if (j === index) {
              return { tag: "local", index: 0 }
            } else {
              return { tag: "ivar", index }
            }
          }),
        },
      },
    ])
  }
  frameCache.set(selector, frameClass)
  return { tag: "object", ivars, class: frameClass }
}

function expr(compiler: Scope, value: ASTExpr): IRExpr {
  switch (value.tag) {
    case "self":
      return { tag: "self" }
    case "integer":
      return { tag: "primitive", class: intClass, value: value.value }
    case "string":
      return { tag: "primitive", class: stringClass, value: value.value }
    case "identifier":
      return compiler.lookup(value.value)
    case "call": {
      const target = expr(compiler, value)
      const args = argList(compiler, value.args)
      switch (args.tag) {
        case "methods":
          throw new Error("cannot define methods in method call")
        case "pairs":
          return {
            tag: "call",
            target,
            selector: args.selector,
            args: args.args.map(({ value }) => value),
          }
      }
    }
    case "object": {
      const args = argList(compiler, value.args)
      switch (args.tag) {
        case "methods":
          return object(compiler, args.methods)
        case "pairs":
          return frame(args.selector, args.args)
      }
    }
  }
}

function letStmt(
  compiler: Scope,
  binding: ASTBinding,
  value: IRExpr
): IRStmt[] {
  switch (binding.tag) {
    case "identifier": {
      const record = compiler.use(binding.value)
      return [{ tag: "let", index: record.index, value }]
    }
    case "object":
      const record = compiler.useAnon()
      const out: IRStmt[] = [{ tag: "let", index: record.index, value }]
      for (const param of binding.params) {
        switch (param.tag) {
          case "key":
            throw new Error(`Invalid destructuring with key ${param.key}`)
          case "pair":
            out.push(
              ...letStmt(compiler, param.value, {
                tag: "call",
                selector: param.key,
                target: value,
                args: [],
              })
            )
        }
      }
      return out
  }
}

function stmt(compiler: Scope, stmt: ASTStmt): IRStmt[] {
  switch (stmt.tag) {
    case "let": {
      const value = expr(compiler, stmt.value)
      return letStmt(compiler, stmt.binding, value)
    }
    case "return":
      return [{ tag: "return", value: expr(compiler, stmt.value) }]
    case "expr":
      return [{ tag: "return", value: expr(compiler, stmt.value) }]
  }
}

function body(compiler: Scope, stmts: ASTStmt[]): IRStmt[] {
  return stmts.flatMap((s) => stmt(compiler, s))
}

export function program(stmts: ASTStmt[]): IRStmt[] {
  const compiler = new Scope()
  return body(compiler, stmts)
}
