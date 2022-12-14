import {
  Instance,
  IRExpr,
  IRHandler,
  Locals,
  Scope,
  ScopeRecord,
  ScopeType,
} from "./interface"
import { IRClass } from "./value"
import { IRIvarExpr, IRLocalExpr, IRObjectExpr, IRSelfExpr } from "./ir-expr"
import { IRGetterHandler, IRLazyHandler } from "./ir-handler"
import { UnreachableError } from "./error"

export class ReferenceError {
  constructor(readonly key: string) {}
}
export class NotVarError {
  constructor(readonly key: string) {}
}
export class OuterScopeVarError {
  constructor(readonly key: string) {}
}
export class NoModuleSelfError {}
export class BlockReferenceError {
  constructor(readonly key: string) {}
}
export class VarDoubleBorrowError {}

export class ScopedExportError {
  constructor(readonly key: string) {}
}
export class DuplicateExportError {
  constructor(readonly key: string) {}
}

class LocalsImpl implements Locals {
  protected locals = new Map<string, ScopeRecord>()
  constructor(protected localsIndex = 0) {}
  get(key: string): ScopeRecord | undefined {
    return this.locals.get(key)
  }
  set(key: string, value: ScopeRecord): ScopeRecord {
    this.locals.set(key, value)
    return value
  }
  create(type: ScopeType): ScopeRecord {
    return { index: this.localsIndex++, type }
  }
  allocate(count: number): number {
    const prev = this.localsIndex
    this.localsIndex += count
    return prev
  }
}

class BlockLocals extends LocalsImpl implements Locals {
  constructor(private parent: Locals) {
    super(parent.allocate(0))
  }
  get(key: string): ScopeRecord | undefined {
    const res = this.locals.get(key)
    if (res) return res
    return this.parent.get(key)
  }
}

export function createInstance(scope: Scope): ObjectInstance {
  return new ObjectInstance(scope)
}

class NilInstance implements Instance {
  lookup(key: string): IRExpr {
    throw new ReferenceError(key)
  }
  self(): IRExpr {
    throw new NoModuleSelfError()
  }
  /* istanbul ignore next */
  getPlaceholderHandler(selector: string): IRHandler {
    throw new UnreachableError("root instance does not define handlers")
  }
  /* istanbul ignore next */
  handlerScope(arity: number): Scope {
    throw new UnreachableError("root instance does not define handlers")
  }
}

class ObjectInstance implements Instance {
  private ivarMap = new Map<string, ScopeRecord>()
  private placeholderHandlers: { selector: string; handler: IRLazyHandler }[] =
    []
  readonly ivars: IRExpr[] = []
  constructor(private parentScope: Scope) {}
  lookup(key: string): IRExpr {
    const found = this.ivarMap.get(key)
    if (found) return new IRIvarExpr(found.index)

    const index = this.ivars.length
    this.ivars.push(this.parentScope.lookupOuterLet(key))
    this.ivarMap.set(key, { index, type: "let" })
    return new IRIvarExpr(index)
  }
  self(): IRExpr {
    return IRSelfExpr
  }
  getPlaceholderHandler(selector: string): IRHandler {
    const handler = new IRLazyHandler()
    this.placeholderHandlers.push({ selector, handler })
    return handler
  }
  compileSelfHandlers(cls: IRClass) {
    for (const placeholder of this.placeholderHandlers) {
      const handler = cls.get(placeholder.selector)
      placeholder.handler.replace(handler)
    }
  }
  handlerScope(arity: number): Scope {
    return new BasicScope(this, new LocalsImpl(arity))
  }
}

class BasicScope implements Scope {
  constructor(readonly instance: Instance, readonly locals: Locals) {}
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (!res) return this.instance.lookup(key)
    switch (res.type) {
      case "do":
        throw new BlockReferenceError(key)
      case "var":
      case "let":
        return new IRLocalExpr(res.index)
    }
  }
  lookupOuterLet(key: string): IRExpr {
    const res = this.locals.get(key)
    if (!res) return this.instance.lookup(key)
    switch (res.type) {
      case "do":
        throw new BlockReferenceError(key)
      case "var":
        throw new OuterScopeVarError(key)
      case "let":
        return new IRLocalExpr(res.index)
    }
  }
  lookupVarIndex(key: string): number {
    const res = this.locals.get(key)
    if (!res) throw new ReferenceError(key)
    switch (res.type) {
      case "do":
      case "let":
        throw new NotVarError(key)
      case "var":
        return res.index
    }
  }
  addExport(key: string) {
    throw new ScopedExportError(key)
  }
  sendScope(): SendScope {
    return new SendScope(this.instance, new BlockLocals(this.locals))
  }
}

class RootScope extends BasicScope {
  private exports = new Map<string, IRExpr>()
  constructor() {
    super(new NilInstance(), new LocalsImpl())
  }
  addExport(key: string): void {
    if (this.exports.has(key)) throw new DuplicateExportError(key)
    const value = this.lookup(key)
    this.exports.set(key, value)
  }
  compileExports(): IRExpr {
    const exportClass = new IRClass(new Map(), null)
    const ivars = Array.from(this.exports).map(([key, value], i) => {
      exportClass.add(key, new IRGetterHandler(i))
      return value
    })
    return new IRObjectExpr(exportClass, ivars)
  }
}

// - allow do-blocks to be message args & targets
// - track var borrows
class SendScope extends BasicScope {
  constructor(
    instance: Instance,
    locals: Locals,
    private borrows = new Set<string>()
  ) {
    super(instance, locals)
  }
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (!res) return this.instance.lookup(key)
    switch (res.type) {
      case "var":
        if (this.borrows.has(key)) throw new VarDoubleBorrowError()
        this.borrows.add(key)
        return new IRLocalExpr(res.index)
      case "do":
      case "let":
        return new IRLocalExpr(res.index)
    }
  }
  lookupVarIndex(key: string): number {
    // FIXME: this should throw for duplicate var args
    // but not for a do object that closes over the same var in multiple handlers
    // if (this.borrows.has(key)) throw new VarDoubleBorrowError()
    this.borrows.add(key)
    return super.lookupVarIndex(key)
  }
  blockBodyScope(): SendScope {
    return new SendScope(
      this.instance,
      new BlockLocals(this.locals),
      this.borrows
    )
  }
  blockParamsScope(): Scope {
    return new BasicScope(this.instance, this.locals)
  }
}

export function rootScope(): RootScope {
  return new RootScope()
}
