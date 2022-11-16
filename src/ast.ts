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
import {
  ASTStmt,
  ASTExpr,
  ASTArg,
  ASTLetBinding,
  ASTHandler,
  InvalidFrameArgError,
} from "./ast-parser"

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

function expr(value: ParseExpr): ASTExpr {
  switch (value.tag) {
    case "self":
    case "integer":
    case "float":
    case "string":
    case "identifier":
    case "unit":
      return value
    case "parens":
      return expr(value.value)
    case "unaryOp":
      return {
        tag: "send",
        target: expr(value.target),
        selector: value.operator,
        args: [],
      }
    case "binaryOp":
      return {
        tag: "send",
        target: expr(value.target),
        selector: `${value.operator}:`,
        args: [{ tag: "expr", value: expr(value.arg) }],
      }
    case "do":
      return {
        tag: "send",
        target: { tag: "frame", selector: "", args: [] },
        selector: ":",
        args: [
          {
            tag: "do",
            value: {
              tag: "object",
              else: null,
              handlers: new Map<string, ASTHandler>([
                [
                  "",
                  {
                    selector: "",
                    params: [],
                    body: value.body.map(stmt),
                  },
                ],
              ]),
            },
          },
        ],
      }
    case "if": {
      const res = value.conds.reduceRight((falseBlock, cond) => {
        const trueBlock: ASTStmt[] = cond.body.map(stmt)
        const send: ASTExpr = {
          tag: "send",
          selector: ":",
          target: expr(cond.value),
          args: [
            {
              tag: "do",
              value: {
                tag: "object",
                else: null,
                handlers: new Map<string, ASTHandler>([
                  [
                    "true",
                    {
                      selector: "true",
                      params: [],
                      body: trueBlock,
                    },
                  ],
                  [
                    "false",
                    {
                      selector: "false",
                      params: [],
                      body: falseBlock,
                    },
                  ],
                ]),
              },
            },
          ],
        }
        return [{ tag: "expr", value: send } as ASTStmt]
      }, value.else.map(stmt))
      /* istanbul ignore next */
      if (!res.length || res[0].tag !== "expr") throw new Error("unreachable")
      return res[0].value
    }
    case "object":
      return handlerSet(value.handlers)
    case "frame":
      if (value.as) throw new InvalidFrameArgError()
      return value.message.frame({ expr })
    case "send":
      return value.message.send({ expr, handlerSet }, expr(value.target))
  }
}

function letBinding(value: ParseExpr): ASTLetBinding {
  switch (value.tag) {
    case "identifier":
      return value
    case "frame":
      let as: string | null = null
      if (value.as) {
        if (value.as.tag !== "identifier") throw new InvalidLetBindingError()
        as = value.as.value
      }
      return {
        tag: "object",
        params: value.message.destructure({ letBinding }),
        as,
      }
    default:
      throw new InvalidLetBindingError()
  }
}

function setBinding(value: ParseExpr): ASTSetBinding {
  if (value.tag === "identifier") return value
  throw new InvalidSetTargetError()
}

function setInPlace(value: ParseExpr): ASTStmt {
  let root = value
  while (true) {
    switch (root.tag) {
      case "identifier":
        return { tag: "set", binding: root, value: expr(value) }
      case "send":
        root = root.target
        continue
      default:
        throw new InvalidSetTargetError()
    }
  }
}

function varBinding(value: ParseExpr): ASTVarBinding {
  if (value.tag === "identifier") return value
  throw new InvalidVarBindingError()
}

function importBinding(value: ParseExpr): ASTImportBinding {
  switch (value.tag) {
    case "frame":
      if (value.as) throw new InvalidImportBindingError()
      return {
        tag: "object",
        params: value.message.destructure({ letBinding }),
        as: null,
      }
    default:
      throw new InvalidImportBindingError()
  }
}

function importSource(value: ParseExpr): ASTImportSource {
  if (value.tag === "string") return value
  throw new InvalidImportSourceError()
}

function stmt(value: ParseStmt): ASTStmt {
  switch (value.tag) {
    case "let":
      return {
        tag: "let",
        binding: letBinding(value.binding),
        value: expr(value.value),
        export: value.export,
      }
    case "set":
      return {
        tag: "set",
        binding: setBinding(value.binding),
        value: expr(value.value),
      }
    case "setInPlace":
      return setInPlace(value.binding)
    case "var":
      return {
        tag: "var",
        binding: varBinding(value.binding),
        value: expr(value.value),
      }
    case "provide":
      return value.message.provide({ expr, handlerSet })
    case "using":
      return value.message.using({ letBinding })
    case "import":
      return {
        tag: "import",
        binding: importBinding(value.binding),
        source: importSource(value.value),
      }
    case "defer":
      return { tag: "defer", body: value.body.map(stmt) }
    case "return":
      return { tag: "return", value: expr(value.value) }
    case "expr":
      return { tag: "expr", value: expr(value.value) }
  }
}

export function program(items: ParseStmt[]): ASTStmt[] {
  return items.map(stmt)
}
