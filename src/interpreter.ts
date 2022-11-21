import { NoProviderError } from "./error"
import { Interpreter, IRStmt, Value } from "./interface"
import { body } from "./ir-stmt"
import { unit } from "./value"

export type IRModules = Map<string, IRStmt[]>

export class Modules {
  private cache = new Map<string, Value>()
  private circularRefs = new Set<string>()
  constructor(private sources: IRModules) {}
  get(key: string): Value {
    const cached = this.cache.get(key)
    if (cached) return cached

    /* istanbul ignore next */
    if (this.circularRefs.has(key)) throw "circular ref"
    this.circularRefs.add(key)

    const source = this.sources.get(key)
    /* istanbul ignore next */
    if (!source) throw "no such module"

    const ctx = new InterpreterImpl(unit, new Map(), this)
    const result: Value = body(ctx, source)
    this.cache.set(key, result)
    return result
  }
}

export class InterpreterImpl implements Interpreter {
  static root(moduleSources: Map<string, IRStmt[]>): Interpreter {
    return new InterpreterImpl(unit, new Map(), new Modules(moduleSources))
  }
  private locals: Value[] = []
  private defers: IRStmt[][] = []
  constructor(
    readonly self: Value,
    private provideScope: Map<string, Value>,
    private modules: Modules
  ) {}
  setLocal(index: number, value: Value) {
    this.locals[index] = value
  }
  getLocal(index: number): Value {
    const result = this.locals[index]
    /* istanbul ignore next */
    if (!result) {
      throw new Error(`missing local ${index}`)
    }
    return result
  }
  getIvar(index: number): Value {
    return this.self.getIvar(index)
  }
  use(key: string): Value {
    const res = this.provideScope.get(key)
    if (!res) throw new NoProviderError(key)
    return res
  }
  provide(key: string, value: Value) {
    const next = new Map(this.provideScope)
    next.set(key, value)
    this.provideScope = next
  }
  createChild(self: Value): Interpreter {
    return new InterpreterImpl(self, this.provideScope, this.modules)
  }
  getModule(key: string) {
    return this.modules.get(key)
  }
  defer(value: IRStmt[]) {
    this.defers.push(value)
  }
  // TODO: this feels a little janky
  resolveDefers() {
    const defers = this.defers.reverse()
    this.defers = []
    for (const defer of defers) {
      body(this, defer)
    }
    this.defers = []
  }
}

export function program(stmts: IRStmt[], modules: IRModules): Value {
  const ctx = InterpreterImpl.root(modules)
  return body(ctx, stmts)
}
