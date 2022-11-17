import { compileLet } from "./compiler"
import {
  InvalidImportBindingError,
  InvalidImportSourceError,
  InvalidLetBindingError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  ASTLetBinding,
  IRExpr,
  IRStmt,
  ParseArgs,
  ParseExpr,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import {
  IRAssignStmt,
  IRDeferStmt,
  IRModuleExpr,
  IRReturnStmt,
} from "./interpreter"

function letBinding(value: ParseExpr): ASTLetBinding {
  if (!value.letBinding) throw new InvalidLetBindingError()
  return value.letBinding()
}

export class ExprStmt implements ParseStmt {
  constructor(private expr: ParseExpr) {}
  unwrap(): ParseExpr {
    return this.expr
  }
  compile(scope: Scope): IRStmt[] {
    return [this.expr.compile(scope)]
  }
}

export class DeferStmt implements ParseStmt {
  constructor(private body: ParseStmt[]) {}
  compile(scope: Scope): IRStmt[] {
    return [new IRDeferStmt(this.body.flatMap((stmt) => stmt.compile(scope)))]
  }
}

export class ReturnStmt implements ParseStmt {
  constructor(private expr: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    return [new IRReturnStmt(this.expr.compile(scope))]
  }
}

export class ImportStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private source: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.binding.importBinding) throw new InvalidImportBindingError()
    const binding = this.binding.importBinding()
    if (!this.source.importSource) throw new InvalidImportSourceError()
    const source = this.source.importSource()
    return compileLet(scope, binding, new IRModuleExpr(source.value))
  }
}

export class UsingStmt implements ParseStmt {
  constructor(private params: ParseParams) {}
  compile(scope: Scope): IRStmt[] {
    return this.params.using(scope)
  }
}

export class ProvideStmt implements ParseStmt {
  constructor(private args: ParseArgs) {}
  compile(scope: Scope): IRStmt[] {
    return this.args.provide(scope)
  }
}

export class VarStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private expr: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.binding.simpleBinding) throw new InvalidVarBindingError()
    const expr = this.expr.compile(scope)
    const binding = this.binding.simpleBinding()
    const record = scope.locals.set(binding.value, scope.locals.create("var"))
    return [new IRAssignStmt(record.index, expr)]
  }
}

export class LetStmt implements ParseStmt {
  constructor(
    private binding: ParseExpr,
    private expr: ParseExpr,
    private hasExport: boolean
  ) {}
  compile(scope: Scope): IRStmt[] {
    const binding = letBinding(this.binding)
    const result = compileLet(
      scope,
      letBinding(this.binding),
      this.bindExpr(scope, binding, this.expr)
    )
    if (this.hasExport) {
      this.getExports(scope, binding)
    }

    return result
  }
  private bindExpr(
    scope: Scope,
    binding: ASTLetBinding,
    value: ParseExpr
  ): IRExpr {
    if (binding.tag === "identifier") {
      return value.compile(scope, binding.value)
    } else {
      return value.compile(scope)
    }
  }
  private getExports(scope: Scope, binding: ASTLetBinding) {
    switch (binding.tag) {
      case "identifier":
        scope.addExport(binding.value)
        return
      case "object":
        for (const param of binding.params) {
          this.getExports(scope, param.value)
        }
    }
  }
}

export class SetStmt implements ParseStmt {
  constructor(private binding: ParseExpr, private expr: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.binding.simpleBinding) throw new InvalidSetTargetError()
    const binding = this.binding.simpleBinding()
    const expr = this.expr.compile(scope)
    return [new IRAssignStmt(scope.lookupVarIndex(binding.value), expr)]
  }
}

export class SetInPlaceStmt implements ParseStmt {
  constructor(private place: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.place.setInPlace) throw new InvalidSetTargetError()
    const binding = this.place.setInPlace()
    const expr = this.place.compile(scope)
    return [new IRAssignStmt(scope.lookupVarIndex(binding.value), expr)]
  }
}