import {
  InvalidImportBindingError,
  InvalidVarBindingError,
  UnreachableError,
} from "./error"
import { IRExpr, IRStmt, ParseBinding, ParseParams, Scope } from "./interface"
import { IRAssignStmt } from "./ir-stmt"
import { IRLocalExpr } from "./ir-expr"

export const ParsePlaceholder: ParseBinding = {
  let(scope, value) {
    scope.locals.create("let")
    return []
  },
  import(scope, source) {
    return []
  },
  var() {
    throw new InvalidVarBindingError()
  },
  /* istanbul ignore next */
  set(scope: Scope, expr: IRExpr): IRStmt[] {
    throw new UnreachableError("placeholder set target is parse error")
  },
  selfBinding() {
    return []
  },
  export(scope) {},
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
  constructor(
    private params: ParseParams,
    private as: ParseBinding = ParsePlaceholder
  ) {}
  let(scope: Scope, value: IRExpr): IRStmt[] {
    return [...this.as.let(scope, value), ...this.params.let(scope, value)]
  }
  import(scope: Scope, source: IRExpr): IRStmt[] {
    return [
      ...this.as.import(scope, source),
      ...this.params.import(scope, source),
    ]
  }
  var(scope: Scope, expr: IRExpr): IRStmt[] {
    throw new InvalidVarBindingError()
  }
  /* istanbul ignore next */
  set(scope: Scope, expr: IRExpr): IRStmt[] {
    throw new UnreachableError("destructuring set target is parse error")
  }
  selfBinding(scope: Scope): IRStmt[] {
    return []
  }
  export(scope: Scope): void {
    this.as.export(scope)
    this.params.export(scope)
  }
  param(scope: Scope, offset: number): IRStmt[] {
    return [
      ...this.as.param(scope, offset),
      ...this.let(scope, new IRLocalExpr(offset)),
    ]
  }
}
