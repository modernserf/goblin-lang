import {
  InvalidImportBindingError,
  InvalidImportSourceError,
  InvalidSetTargetError,
  InvalidVarBindingError,
} from "./error"
import {
  ASTLetBinding,
  IRStmt,
  ParseArgs,
  ParseBinding,
  ParseExpr,
  ParseParams,
  ParseStmt,
  Scope,
} from "./interface"
import { IRDeferStmt, IRReturnStmt } from "./interpreter"

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
  constructor(private binding: ParseBinding, private source: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.source.importSource) throw new InvalidImportSourceError()
    const source = this.source.importSource(scope)
    if (!this.binding.importBinding) throw new InvalidImportBindingError()
    return this.binding.importBinding(scope, source)
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
  constructor(private binding: ParseBinding, private expr: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.binding.var) throw new InvalidVarBindingError()
    return this.binding.var(scope, this.expr)
  }
}

export class LetStmt implements ParseStmt {
  constructor(
    private binding: ParseBinding,
    private expr: ParseExpr,
    private hasExport: boolean
  ) {}
  compile(scope: Scope): IRStmt[] {
    const result = this.binding.let(
      scope,
      this.expr.compile(scope, this.binding)
    )
    if (this.hasExport) {
      this.getExports(scope, this.binding.letBinding())
    }

    return result
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
  constructor(private binding: ParseBinding, private expr: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.binding.set) throw new InvalidSetTargetError()
    return this.binding.set(scope, this.expr)
  }
}

export class SetInPlaceStmt implements ParseStmt {
  constructor(private place: ParseExpr) {}
  compile(scope: Scope): IRStmt[] {
    if (!this.place.setInPlace) throw new InvalidSetTargetError()
    return this.place.setInPlace(scope, this.place)
  }
}
