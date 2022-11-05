import { ASTBinding, ASTExpr, ASTMethod, ASTStmt } from "./parser"

export type PrimitiveMethod = (value: any, args: any[]) => any

export type PrimitiveClass = Map<string, PrimitiveMethod>

const stringClass: PrimitiveClass = new Map([])
const intClass: PrimitiveClass = new Map([
  [
    "+:",
    (self, args: { class: PrimitiveClass; value: any }[]) => {
      const arg = args[0]
      if (arg.class !== intClass) throw new Error("Expected integer")
      return { tag: "primitive", class: intClass, value: self + arg.value }
    },
  ],
])

type Method = { body: IRStmt[] }
export type IRClass = Map<string, Method>

export type IRExpr =
  | { tag: "local"; index: number }
  | { tag: "ivar"; index: number }
  | { tag: "self" }
  | { tag: "primitive"; class: PrimitiveClass; value: any }
  | { tag: "object"; class: IRClass; ivars: IRExpr[] }
  | { tag: "call"; selector: string; target: IRExpr; args: IRExpr[] }

export type IRStmt =
  | { tag: "assign"; index: number; value: IRExpr }
  | { tag: "return"; value: IRExpr }
  | { tag: "expr"; value: IRExpr }

type ScopeType = "let" | "var"
type ScopeRecord = { index: number; type: ScopeType }

class Instance {
  private ivarMap = new Map<string, ScopeRecord>()
  readonly ivars: IRExpr[] = []
  constructor(private parent: Scope) {}
  lookup(key: string): IRExpr {
    const found = this.ivarMap.get(key)
    if (found) return { tag: "ivar", index: found.index }

    const index = this.ivars.length
    this.ivars.push(this.parent.lookupOuter(key))
    this.ivarMap.set(key, { index, type: "let" })
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
      throw new Error(`unknown binding ${key}`)
    }
    return this.instance.lookup(key)
  }
  lookupOuter(key: string): IRExpr {
    const record = this.locals.get(key)
    if (record) {
      if (record.type == "var") {
        throw new Error(`cannot access var ${key} from outer scope`)
      }
      return { tag: "local", index: record.index }
    }
    if (!this.instance) {
      throw new Error(`unknown binding ${key}`)
    }
    return this.instance.lookup(key)
  }
  use(key: string): ScopeRecord {
    if (this.locals.has(key)) {
      throw new Error(`duplicate binding ${key}`)
    }
    const record: ScopeRecord = { index: this.localsIndex++, type: "let" }
    this.locals.set(key, record)
    return record
  }
  useAnon(): ScopeRecord {
    const record: ScopeRecord = { index: this.localsIndex++, type: "let" }
    return record
  }
  useVar(key: string): ScopeRecord {
    if (this.locals.has(key)) {
      throw new Error(`duplicate binding ${key}`)
    }
    const record: ScopeRecord = { index: this.localsIndex++, type: "var" }
    this.locals.set(key, record)
    return record
  }
  set(key: string): ScopeRecord {
    const record = this.locals.get(key)
    if (!record) throw new Error(`unknown binding ${key}`)
    if (record.type !== "var") throw new Error(`Binding ${key} is not var`)
    return record
  }
  newInstance(): Instance {
    return new Instance(this)
  }
}

function object(
  parentCompiler: Scope,
  selfBinding: string | null,
  methods: Map<string, ASTMethod>
): IRExpr {
  const instance = parentCompiler.newInstance()
  const objectClass: IRClass = new Map()
  for (const [selector, method] of methods) {
    const scope = instance.newScope()
    const methodBody: IRStmt[] = []
    switch (method.params.tag) {
      case "object":
        throw new Error("invalid method definition")
      case "key":
        break
      case "pairs":
        for (const { value: bind } of method.params.pairs) {
          switch (bind.tag) {
            case "identifier":
              if (bind.value === selfBinding) {
                selfBinding = null
              }
              scope.use(bind.value)
              break
            case "object": {
              const record = scope.useAnon()
              const local: IRExpr = { tag: "local", index: record.index }
              methodBody.push(...letStmt(scope, bind, local))
            }
          }
        }
    }

    if (selfBinding !== null) {
      const { index } = scope.use(selfBinding)
      methodBody.push({ tag: "assign", index, value: { tag: "self" } })
    }

    methodBody.push(...body(scope, method.body))
    objectClass.set(selector, { body: methodBody })
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
  frameClass.set(selector, {
    body: [
      {
        tag: "return",
        value: {
          tag: "object",
          class: frameClass,
          ivars: args.map((_, index) => ({ tag: "local", index })),
        },
      },
    ],
  })
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.set(":", {
    body: [
      {
        tag: "return",
        value: {
          tag: "call",
          selector: selector,
          target: { tag: "local", index: 0 },
          args: args.map((_, index) => ({ tag: "ivar", index })),
        },
      } as IRStmt,
    ],
  })
  for (const [index, { key }] of args.entries()) {
    // getter: [x: 1 y: 2]{x}
    frameClass.set(key, {
      body: [{ tag: "return", value: { tag: "ivar", index } }],
    })
    // setter: [x: 1 y: 2]{x: 3}
    frameClass.set(`${key}:`, {
      body: [
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
      ],
    })
  }
  frameCache.set(selector, frameClass)
  return { tag: "object", ivars, class: frameClass }
}

function expr(scope: Scope, value: ASTExpr): IRExpr {
  switch (value.tag) {
    case "self":
      return { tag: "self" }
    case "integer":
      return { tag: "primitive", class: intClass, value: value.value }
    case "string":
      return { tag: "primitive", class: stringClass, value: value.value }
    case "identifier":
      return scope.lookup(value.value)
    case "call": {
      const target = expr(scope, value.target)
      switch (value.args.tag) {
        case "object":
          throw new Error("cannot define methods in method call")
        case "key":
          return {
            tag: "call",
            target,
            selector: value.args.selector,
            args: [],
          }
        case "pairs":
          return {
            tag: "call",
            target,
            selector: value.args.selector,
            args: value.args.pairs.map(({ value }) => expr(scope, value)),
          }
      }
    }
    case "object": {
      switch (value.args.tag) {
        case "object":
          return object(scope, null, value.args.methods)
        case "pairs":
          return frame(
            value.args.selector,
            value.args.pairs.map(({ key, value }) => ({
              key,
              value: expr(scope, value),
            }))
          )
        case "key":
          return frame(value.args.selector, [])
      }
    }
  }
}

function bindExpr(scope: Scope, binding: ASTBinding, value: ASTExpr): IRExpr {
  if (
    binding.tag === "identifier" &&
    value.tag === "object" &&
    value.args.tag === "object"
  ) {
    return object(scope, binding.value, value.args.methods)
  } else {
    return expr(scope, value)
  }
}

function letStmt(scope: Scope, binding: ASTBinding, value: IRExpr): IRStmt[] {
  switch (binding.tag) {
    case "identifier": {
      const record = scope.use(binding.value)
      return [{ tag: "assign", index: record.index, value }]
    }
    case "object":
      const record = scope.useAnon()
      const out: IRStmt[] = [{ tag: "assign", index: record.index, value }]
      if (binding.params.tag !== "pairs") {
        throw new Error("invalid destructuring")
      }

      for (const param of binding.params.pairs) {
        out.push(
          ...letStmt(scope, param.value, {
            tag: "call",
            selector: param.key,
            target: value,
            args: [],
          })
        )
      }
      return out
  }
}

function varStmt(scope: Scope, binding: ASTBinding, value: IRExpr): IRStmt[] {
  switch (binding.tag) {
    case "object":
      throw new Error("Cannot destructure var binding")
    case "identifier":
      const record = scope.useVar(binding.value)
      return [{ tag: "assign", index: record.index, value }]
  }
}

function setStmt(scope: Scope, binding: ASTBinding, value: IRExpr): IRStmt[] {
  switch (binding.tag) {
    case "object":
      throw new Error("Cannot destructure set binding")
    case "identifier":
      const record = scope.set(binding.value)
      return [{ tag: "assign", index: record.index, value }]
  }
}

function stmt(scope: Scope, stmt: ASTStmt): IRStmt[] {
  switch (stmt.tag) {
    case "let":
      return letStmt(
        scope,
        stmt.binding,
        bindExpr(scope, stmt.binding, stmt.value)
      )
    case "var":
      return varStmt(
        scope,
        stmt.binding,
        bindExpr(scope, stmt.binding, stmt.value)
      )
    case "set":
      return setStmt(scope, stmt.binding, expr(scope, stmt.value))
    case "return":
      return [{ tag: "return", value: expr(scope, stmt.value) }]
    case "expr":
      return [{ tag: "return", value: expr(scope, stmt.value) }]
  }
}

function body(scope: Scope, stmts: ASTStmt[]): IRStmt[] {
  return stmts.flatMap((s) => stmt(scope, s))
}

export function program(stmts: ASTStmt[]): IRStmt[] {
  const scope = new Scope()
  return body(scope, stmts)
}
