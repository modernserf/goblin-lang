import { IRClass, IRExpr, IRHandler, NoHandlerError } from "./interpreter"

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
    if (found) return { tag: "ivar", index: found.index }

    const index = this.ivars.length
    this.ivars.push(this.parentScope.lookupOuterLet(key))
    this.ivarMap.set(key, { index, type: "let" })
    return { tag: "ivar", index }
  }
  self(): IRExpr {
    return { tag: "self" }
  }
  getPlaceholderHandler(selector: string): IRHandler {
    const handler: IRHandler = { tag: "object", body: [], params: [] }
    this.placeholderHandlers.push({ selector, handler })
    return handler
  }
  compileSelfHandlers(cls: IRClass) {
    for (const placeholder of this.placeholderHandlers) {
      const handler = cls.handlers.get(placeholder.selector)
      if (!handler) {
        // TODO: use elseHandler if available
        throw new NoHandlerError(placeholder.selector)
      }
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

export interface Scope {
  lookup(key: string): IRExpr
  lookupOuterLet(key: string): IRExpr
  lookupVarIndex(key: string): number
  readonly locals: Locals
  readonly instance: Instance
}

export class BasicScope implements Scope {
  constructor(readonly instance: Instance, readonly locals: Locals) {}
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (!res) return this.instance.lookup(key)
    switch (res.type) {
      case "do":
        throw new BlockReferenceError(key)
      case "var":
      case "let":
        return { tag: "local", index: res.index }
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
        return { tag: "local", index: res.index }
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

// - allow do-blocks to be message args & targets
// - track var borrows
export class SendScope implements Scope {
  private borrows = new Set<string>()
  private delegate = new BasicScope(this.instance, this.locals)
  constructor(readonly instance: Instance, readonly locals: Locals) {}
  lookup(key: string): IRExpr {
    const res = this.locals.get(key)
    if (!res) return this.instance.lookup(key)
    switch (res.type) {
      case "var":
        if (this.borrows.has(key)) throw new VarDoubleBorrowError()
        this.borrows.add(key)
        return { tag: "local", index: res.index }
      case "do":
      case "let":
        return { tag: "local", index: res.index }
    }
  }
  lookupVarIndex(key: string): number {
    if (this.borrows.has(key)) throw new VarDoubleBorrowError()
    this.borrows.add(key)
    return this.delegate.lookupVarIndex(key)
  }
  lookupOuterLet(key: string): IRExpr {
    return this.delegate.lookupOuterLet(key)
  }
}
