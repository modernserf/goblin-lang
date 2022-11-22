import {
  InvalidImportBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import { IRExpr, IRStmt, ParseBinding, ParseParams, Scope } from "./interface"
import { IRAssignStmt } from "./ir-stmt"
import { IRLocalExpr } from "./ir-expr"

export const ParsePlaceholder: ParseBinding = {
  let(scope, value) {
    return []
  },
  import(scope, source) {
    throw new InvalidImportBindingError()
  },
  var() {
    throw new InvalidVarBindingError()
  },
  set() {
    throw new InvalidSetTargetError()
  },
  selfBinding() {
    return []
  },
  export(scope) {
    throw new Error("invalid export")
  },
  param() {
    return []
  },
}

export class ParseBindIdent implements ParseBinding {
  constructor(private value: string) {}
  let(scope: Scope, expr: IRExpr): IRStmt[] {
    const record = scope.locals.set(this.value, scope.locals.create("let"))
    return [new IRAssignStmt(record.index, expr)]
  }
  var(scope: Scope, expr: IRExpr): IRStmt[] {
    const record = scope.locals.set(this.value, scope.locals.create("var"))
    return [new IRAssignStmt(record.index, expr)]
  }
  selfBinding(scope: Scope): IRStmt[] {
    return this.let(scope, scope.instance.self())
  }
  set(scope: Scope, expr: IRExpr): IRStmt[] {
    return [new IRAssignStmt(scope.lookupVarIndex(this.value), expr)]
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    throw new InvalidImportBindingError()
  }
  export(scope: Scope): void {
    scope.addExport(this.value)
  }
  param(scope: Scope, offset: number): IRStmt[] {
    scope.locals.set(this.value, { index: offset, type: "let" })
    return []
  }
}

export class ParseDestructure implements ParseBinding {
  constructor(private params: ParseParams, private as: string | null) {}
  let(scope: Scope, value: IRExpr): IRStmt[] {
    const record = this.useAs(scope)
    return [
      new IRAssignStmt(record.index, value),
      ...this.params.let(scope, value),
    ]
  }
  private useAs(scope: Scope) {
    if (this.as === null) return scope.locals.create("let")
    return scope.locals.set(this.as, scope.locals.create("let"))
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    if (this.as) throw new InvalidImportBindingError()
    return this.params.import(scope, source)
  }
  var(scope: Scope, expr: IRExpr): IRStmt[] {
    throw new InvalidVarBindingError()
  }
  /* istanbul ignore next */
  set(scope: Scope, expr: IRExpr): IRStmt[] {
    throw new Error("unreachable")
  }
  selfBinding(scope: Scope): IRStmt[] {
    return []
  }
  export(scope: Scope): void {
    if (this.as) {
      scope.addExport(this.as)
    }
    this.params.export(scope)
  }
  param(scope: Scope, offset: number): IRStmt[] {
    if (this.as) {
      scope.locals.set(this.as, { index: offset, type: "let" })
    }
    return this.let(scope, new IRLocalExpr(offset))
  }
}
