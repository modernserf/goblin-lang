import {
  IRClass,
  IRExpr,
  IRHandler,
  IRIvarExpr,
  IRLocalExpr,
  IRSelfExpr,
} from "./interpreter"

export type ScopeType = "let" | "var" | "do"
export type ScopeRecord = { index: number; type: ScopeType }

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

export class Locals {
  private locals = new Map<string, ScopeRecord>()
  constructor(private localsIndex = 0) {}
  get(key: string): ScopeRecord | undefined {
    return this.locals.get(key)
  }
  set(key: string, value: ScopeRecord): ScopeRecord {
    this.locals.set(key, value)
    return value
  }
  new(type: ScopeType): ScopeRecord {
    return { index: this.localsIndex++, type }
  }
  allocate(count: number): number {
    const prev = this.localsIndex
    this.localsIndex += count
    return prev
  }
}

export interface Instance {
  lookup(key: string): IRExpr
  self(): IRExpr
  getPlaceholderHandler(selector: string): IRHandler
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
  private placeholderHandlers: { selector: string; handler: IRHandler }[] = []
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
    const handler: IRHandler = { tag: "object", body: [], params: [] }
    this.placeholderHandlers.push({ selector, handler })
    return handler
  }
  compileSelfHandlers(cls: IRClass) {
    for (const placeholder of this.placeholderHandlers) {
      const handler = cls.get(placeholder.selector)
      /* istanbul ignore next */
      if (
        placeholder.handler.tag === "primitive" ||
        handler.tag === "primitive"
      ) {
        throw new Error("unreachable")
      }
      placeholder.handler.body = handler.body
      placeholder.handler.params = handler.params
    }
  }
}

export class Scope {
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
}

export class RootScope extends Scope {
  constructor() {
    super(new NilInstance(), new Locals())
  }
}

export class BasicScope extends Scope {}

// - allow do-blocks to be message args & targets
// - track var borrows
export class SendScope extends Scope {
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
