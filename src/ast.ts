import {
  ParseExpr,
  ParseHandler,
  ParseStmt,
  HandlerSet,
  ASTSetBinding,
  ASTVarBinding,
  ASTImportBinding,
  ASTImportSource,
} from "./ast-parser"
import { ASTStmt, ASTLetBinding, ASTHandler } from "./ast-parser"

export class InvalidBlockArgError {}
export class InvalidLetBindingError {}
export class InvalidSetTargetError {}
export class InvalidVarBindingError {}
export class InvalidImportBindingError {}
export class InvalidImportSourceError {}

function handlerSet(ins: ParseHandler[]): HandlerSet {
  const out: HandlerSet = {
    tag: "object",
    handlers: new Map<string, ASTHandler>(),
    else: null,
  }
  for (const handler of ins.flatMap((x) => x.expand())) {
    handler.addToSet({ letBinding, stmt }, out)
  }

  return out
}

function letBinding(value: ParseExpr): ASTLetBinding {
  if (!value.letBinding) throw new InvalidLetBindingError()
  return value.letBinding(ast)
}

function setBinding(value: ParseExpr): ASTSetBinding {
  if (!value.simpleBinding) throw new InvalidSetTargetError()
  return value.simpleBinding(ast)
}

function setInPlace(value: ParseExpr): ASTStmt {
  if (!value.setInPlace) throw new InvalidSetTargetError()
  return value.setInPlace(ast, value.toAST(ast))
}

function varBinding(value: ParseExpr): ASTVarBinding {
  if (!value.simpleBinding) throw new InvalidVarBindingError()
  return value.simpleBinding(ast)
}

function importBinding(value: ParseExpr): ASTImportBinding {
  if (!value.importBinding) throw new InvalidImportBindingError()
  return value.importBinding(ast)
}

function importSource(value: ParseExpr): ASTImportSource {
  if (!value.importSource) throw new InvalidImportSourceError()
  return value.importSource()
}

function stmt(value: ParseStmt): ASTStmt {
  switch (value.tag) {
    case "let":
      return {
        tag: "let",
        binding: letBinding(value.binding),
        value: value.value.toAST(ast),
        export: value.export,
      }
    case "set":
      return {
        tag: "set",
        binding: setBinding(value.binding),
        value: value.value.toAST(ast),
      }
    case "setInPlace":
      return setInPlace(value.binding)
    case "var":
      return {
        tag: "var",
        binding: varBinding(value.binding),
        value: value.value.toAST(ast),
      }
    case "provide":
      return value.message.provide(ast)
    case "using":
      return value.message.using(ast)
    case "import":
      return {
        tag: "import",
        binding: importBinding(value.binding),
        source: importSource(value.value),
      }
    case "defer":
      return { tag: "defer", body: value.body.map(stmt) }
    case "return":
      return { tag: "return", value: value.value.toAST(ast) }
    case "expr":
      return { tag: "expr", value: value.value.toAST(ast) }
  }
}

export function program(items: ParseStmt[]): ASTStmt[] {
  return items.map(stmt)
}

const ast = { handlerSet, letBinding, stmt }
