import {
  Instance,
  IRExpr,
  IRHandler,
  Locals,
  Scope,
  ScopeRecord,
  ScopeType,
} from "./interface"
import {
  IRClass,
  IRIvarExpr,
  IRLazyHandler,
  IRLocalExpr,
  IRObjectExpr,
  IRObjectHandler,
  IRSelfExpr,
} from "./interpreter"

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

export class LocalsImpl implements Locals {
  private locals = new Map<string, ScopeRecord>()
  constructor(private localsIndex = 0) {}
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

export class NilInstance implements Instance {
  lookup(key: string): IRExpr {
    throw new ReferenceError(key)
  }
  self(): IRExpr {
    throw new NoModuleSelfError()
  }
  getPlaceholderHandler(selector: string): IRHandler {
    throw new NoModuleSelfError()
  }
}

export class ObjectInstance implements Instance {
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
    return new IRSelfExpr()
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
}

export class ScopedExportError {
  constructor(readonly key: string) {}
}
export class DuplicateExportError {
  constructor(readonly key: string) {}
}

class ScopeImpl implements Scope {
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
}

export class RootScope extends ScopeImpl {
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
    const exportClass = new IRClass()
    const ivars: IRExpr[] = []
    for (const [i, [key, value]] of Array.from(this.exports).entries()) {
      ivars[i] = value
      exportClass.add(key, new IRObjectHandler([], [new IRIvarExpr(i)]))
    }
    return new IRObjectExpr(exportClass, ivars)
  }
}

export class BasicScope extends ScopeImpl {}

// - allow do-blocks to be message args & targets
// - track var borrows
export class SendScope extends ScopeImpl {
  private borrows = new Set<string>()
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
    if (this.borrows.has(key)) throw new VarDoubleBorrowError()
    this.borrows.add(key)
    return super.lookupVarIndex(key)
  }
}
