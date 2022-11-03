// export type Binding = { tag: "identifier"; value: string }

import {
  IRBlock,
  IRCallExpr,
  IRClass,
  IRExpr,
  IRExprStmt,
  IRInstanceExpr,
  IRIntegerExpr,
  IRLetStmt,
  IRLocalExpr,
  IRMethod,
  IRObjectExpr,
  IRReturnStmt,
  IRSelfExpr,
  IRStmt,
  IRStringExpr,
} from "./ir-2"

class IndexMap {
  private scope = new Map<string, number>()
  private index = 0
  add(key: string): number {
    if (this.scope.has(key)) {
      throw new Error("duplicate key")
    }
    this.scope.set(key, this.index)
    return this.index++
  }
  has(key: string) {
    return this.scope.has(key)
  }
  get(key: string): number {
    const res = this.scope.get(key)
    if (res === undefined) throw new Error("not found")
    return res
  }
}

interface Scope {
  getIdentifier(key: string): IRExpr
}

const nullScope: Scope = {
  getIdentifier(_: string): IRExpr {
    throw new Error("not found")
  },
}

class Instance implements Scope {
  private ivars = new IndexMap()
  readonly values: IRExpr[] = []
  constructor(private parentCompiler: Compiler) {}
  newMethod(params: ASTParams = new ASTSortedMap([])): Compiler {
    const compiler = new Compiler(this)
    params.compile(compiler)
    return compiler
  }
  getIdentifier(key: string): IRExpr {
    if (this.ivars.has(key)) {
      return new IRInstanceExpr(this.ivars.get(key))
    }
    const index = this.ivars.add(key)
    this.values[index] = this.parentCompiler.getIdentifier(key)
    return new IRInstanceExpr(this.ivars.add(key))
  }
}

class Compiler {
  private locals = new IndexMap()
  constructor(private instance: Scope = nullScope) {}
  getIdentifier(key: string): IRExpr {
    if (this.locals.has(key)) {
      return new IRLocalExpr(this.locals.get(key))
    }
    return this.instance.getIdentifier(key)
  }
  setLocal(key: string): number {
    return this.locals.add(key)
  }
  newInstance(): Instance {
    return new Instance(this)
  }
}

export interface ASTExpr {
  compile(compiler: Compiler): IRExpr
}

export class ASTIntegerExpr implements ASTExpr {
  constructor(private value: number) {}
  compile(_: Compiler): IRExpr {
    return new IRIntegerExpr(this.value)
  }
}

export class ASTStringExpr implements ASTExpr {
  constructor(private value: string) {}
  compile(_: Compiler): IRExpr {
    return new IRStringExpr(this.value)
  }
}

export const ASTSelfExpr: ASTExpr = {
  compile(_: Compiler): IRExpr {
    return IRSelfExpr
  },
}

export class ASTIdentifierExpr implements ASTExpr {
  constructor(private value: string) {}
  compile(compiler: Compiler): IRExpr {
    return compiler.getIdentifier(this.value)
  }
}

export interface ASTMethod {
  selector: string
  compileMethod(instance: Instance): IRMethod
}
export class ASTKeyMethod implements ASTMethod {
  constructor(private key: string, private body: ASTStmt[]) {}
  selector = this.key
  compileMethod(instance: Instance): IRMethod {
    const compiler = instance.newMethod()
    return new IRMethod(
      new IRBlock(this.body.map((stmt) => stmt.compile(compiler)))
    )
  }
}

export class ASTPairMethod implements ASTMethod {
  constructor(private params: ASTParams, private body: ASTStmt[]) {}
  selector = this.params.selector
  compileMethod(instance: Instance): IRMethod {
    const compiler = instance.newMethod(this.params)
    return new IRMethod(
      new IRBlock(this.body.map((stmt) => stmt.compile(compiler)))
    )
  }
}

export class ASTObjectExpr implements ASTExpr {
  constructor(private methods: ASTMethod[]) {}
  compile(parent: Compiler): IRExpr {
    const instance = parent.newInstance()
    const methods = new Map(
      this.methods.map((method) => [
        method.selector,
        method.compileMethod(instance),
      ])
    )

    return new IRObjectExpr(new IRClass(methods), instance.values)
  }
}

export class ASTSortedPair<
  CompileResult,
  Value extends { compile(compiler: Compiler): CompileResult }
> {
  constructor(private key: string, public readonly value: Value) {}
  selector = `${this.key}:`
  cmp(other: ASTSortedPair<CompileResult, Value>): number {
    return this.key.localeCompare(other.key)
  }
  compile(compiler: Compiler): CompileResult {
    return this.value.compile(compiler)
  }
}

export class ASTSortedMap<
  CompileResult,
  Value extends { compile(compiler: Compiler): CompileResult }
> {
  constructor(private pairs: ASTSortedPair<CompileResult, Value>[]) {
    this.pairs.sort((a, b) => a.cmp(b))
  }
  selector = this.pairs.map((p) => p.selector).join("")
  compile(compiler: Compiler): CompileResult[] {
    return this.pairs.map((pair) => pair.compile(compiler))
  }
  toFrame(): IRClass {
    const ivals: IRExpr[] = this.pairs.map((_, i) => new IRInstanceExpr(i))
    // `[x: 1 y: 2]{x}`
    const getters = this.pairs.map(
      (p, i) =>
        [
          p.selector,
          new IRMethod(new IRBlock([new IRReturnStmt(new IRInstanceExpr(i))])),
        ] as const
    )
    // `[x: 1 y: 2]{x: 3}`
    const setters = this.pairs.map((p, i) => {
      const nextIvals = ivals.slice()
      nextIvals[i] = new IRLocalExpr(0)
      const method = new IRMethod(
        new IRBlock([new IRReturnStmt(new IRObjectExpr(methods, nextIvals))])
      )
      return [`${p.selector}:`, method] as const
    })
    const methods: IRClass = new IRClass(
      new Map([
        ...getters,
        ...setters,
        // `[x: 1 y: 2]` => `[{: target} target{x: 1 y: 2}]`
        [
          ":",
          new IRMethod(
            new IRBlock([
              new IRReturnStmt(
                new IRCallExpr(new IRLocalExpr(0), this.selector, ivals)
              ),
            ])
          ),
        ],
      ])
    )
    return methods
  }
}

type ASTParams = ASTSortedMap<unknown, ASTBind>
type ASTFields = ASTSortedMap<IRExpr, ASTExpr>
type ASTArgs = ASTSortedMap<IRExpr, ASTExpr>

export class ASTMethodBuilder {
  private params: ASTSortedPair<unknown, ASTBind>[] = []
  private key: string | null = null
  addKey(key: string) {
    if (this.key !== null) throw new Error("duplicate key")
    if (this.params.length) throw new Error("mixed key and params")
    this.key = key
  }
  addKeyValue(key: string, value: ASTBind) {
    if (this.key !== null) throw new Error("mixed key and params")
    this.params.push(new ASTSortedPair(key, value))
  }
  build(stmt: ASTStmt[]): ASTMethod {
    if (this.key) return new ASTKeyMethod(this.key, stmt)
    return new ASTPairMethod(new ASTSortedMap(this.params), stmt)
  }
}

export class ASTObjectBuilder {
  private fields: ASTSortedPair<IRExpr, ASTExpr>[] = []
  private methods: ASTMethod[] = []
  private key: string | null = null
  addKey(key: string) {
    if (this.key !== null) throw new Error("duplicate key")
    if (this.fields.length) throw new Error("mixed key and fields")
    if (this.methods.length) throw new Error("mixed key and methods")
    this.key = key
  }
  addKeyValue(key: string, value: ASTExpr) {
    if (this.key !== null) throw new Error("mixed key and fields")
    if (this.methods.length) throw new Error("mixed fields and methods")
    this.fields.push(new ASTSortedPair(key, value))
  }
  addMethod(method: ASTMethod) {
    if (this.key !== null) throw new Error("mixed key and methods")
    if (this.fields.length) throw new Error("mixed fields and methods")
    this.methods.push(method)
  }
  build(): ASTExpr {
    if (this.key !== null) return new ASTKeyFrameExpr(this.key)
    if (this.fields) {
      return new ASTFrameExpr(new ASTSortedMap(this.fields))
    }

    return new ASTObjectExpr(this.methods)
  }
}

export class ASTArgsBuilder {
  private args: ASTSortedPair<IRExpr, ASTExpr>[] = []
  private key: string | null = null
  addKey(key: string) {
    if (this.key !== null) throw new Error("duplicate key")
    if (this.args.length) throw new Error("mixed key and pairs")
    this.key = key
  }
  addKeyValue(key: string, value: ASTExpr) {
    if (this.key !== null) throw new Error("mixed key and pairs")
    this.args.push(new ASTSortedPair(key, value))
  }
  build(target: ASTExpr): ASTExpr {
    if (this.key !== null) {
      return new ASTCallKeyExpr(target, this.key)
    }
    return new ASTCallExpr(target, new ASTSortedMap(this.args))
  }
}

export class ASTFrameExpr implements ASTExpr {
  constructor(private fields: ASTFields) {}
  compile(compiler: Compiler): IRExpr {
    return new IRObjectExpr(
      this.fields.toFrame(),
      this.fields.compile(compiler)
    )
  }
}

export class ASTKeyFrameExpr implements ASTExpr {
  constructor(private key: string) {}
  compile(_: Compiler): IRExpr {
    // `[foo]` => `[{:target} target{foo}]`
    return new IRObjectExpr(
      new IRClass(
        new Map([
          [
            ":",
            new IRMethod(
              new IRBlock([
                new IRReturnStmt(
                  new IRCallExpr(new IRLocalExpr(0), this.key, [])
                ),
              ])
            ),
          ],
        ])
      ),
      []
    )
  }
}

export class ASTCallKeyExpr implements ASTExpr {
  constructor(private target: ASTExpr, private key: string) {}
  compile(compiler: Compiler): IRExpr {
    const target = this.target.compile(compiler)
    return new IRCallExpr(target, this.key, [])
  }
}

export class ASTCallExpr implements ASTExpr {
  constructor(private target: ASTExpr, private args: ASTArgs) {}
  compile(compiler: Compiler): IRExpr {
    const target = this.target.compile(compiler)
    const args = this.args.compile(compiler)
    return new IRCallExpr(target, this.args.selector, args)
  }
}

export interface ASTBind {
  // TODO: destructuring will complicate this
  compile(compiler: Compiler): number
}
export class ASTIdentifierBind implements ASTBind {
  constructor(private value: string) {}
  compile(compiler: Compiler): number {
    return compiler.setLocal(this.value)
  }
}

export interface ASTStmt {
  compile(compiler: Compiler): IRStmt
}
export class ASTLetStmt implements ASTStmt {
  constructor(private binding: ASTBind, private expr: ASTExpr) {}
  compile(compiler: Compiler): IRStmt {
    const expr = this.expr.compile(compiler)
    const index = this.binding.compile(compiler)
    return new IRLetStmt(index, expr)
  }
}

export class ASTReturnStmt implements ASTStmt {
  constructor(private expr: ASTExpr) {}
  compile(compiler: Compiler): IRStmt {
    return new IRReturnStmt(this.expr.compile(compiler))
  }
}

export class ASTExprStmt implements ASTStmt {
  constructor(private expr: ASTExpr) {}
  compile(compiler: Compiler): IRStmt {
    return new IRExprStmt(this.expr.compile(compiler))
  }
}

export class ASTProgram {
  constructor(private program: ASTStmt[]) {}
  compile(): IRBlock {
    const compiler = new Compiler()
    return new IRBlock(this.program.map((stmt) => stmt.compile(compiler)))
  }
}
