import { IRExpr, IRParam, IRStmt } from "./interface"
import { IRClass, PrimitiveValue } from "./value"
import {
  IRIvarExpr,
  IRLocalExpr,
  IRObjectExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
  IRTrySendExpr,
} from "./ir-expr"
import {
  IRDoArg,
  IRElseBlockHandler,
  IRGetterHandler,
  IROnBlockHandler,
  IROnHandler,
  IRValueArg,
} from "./ir-handler"
import { constObject } from "./optimize"
import { falseVal, intClass, stringClass, trueVal } from "./primitive"

export class IRClassBuilder extends IRClass {
  constructor() {
    super(new Map(), null)
  }
  addFrame(selector: string, params: IRParam[], body: IRStmt[]): this {
    this.add(selector, new IROnHandler(params, body))
    return this
  }
  addGetter(selector: string, index: number): this {
    this.add(selector, new IRGetterHandler(index))
    return this
  }
}

const $0: IRExpr = new IRLocalExpr(0)
const $1: IRExpr = new IRLocalExpr(1)

const frameCache = new Map<string, IRClass>()
export function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return constObject(cachedClass, ivars)

  const frameClass = new IRClassBuilder()
  for (const [index, { key }] of args.entries()) {
    // getter: [x: 1 y: 2]{x}
    frameClass.addGetter(key, index)
    // setter: [x: 1 y: 2]{x: 3}
    frameClass.addFrame(
      `${key}:`,
      [{ tag: "value" }],
      [
        new IRObjectExpr(
          frameClass,
          args.map((_, j) => {
            if (j === index) {
              return $0
            } else {
              return new IRIvarExpr(j)
            }
          })
        ),
      ]
    )
    // updater: [x: 1 y: 2]{->x: {:x} x + 1}
    // [on {->x: do f} self{x: f{: x}}]
    frameClass.addFrame(
      `-> ${key}:`,
      [{ tag: "do" }],
      [
        new IRSendDirectExpr(
          `-> ${key}:`,
          frameClass.get(`${key}:`),
          IRSelfExpr,
          [
            new IRValueArg(
              new IRSendExpr(":", $0, [new IRValueArg(new IRIvarExpr(index))])
            ),
          ]
        ),
      ]
    )
  }

  // folder: items{into: 0 fold: [+]} => sum
  if (args.length === 0) {
    frameClass.addFrame(
      ":into:",
      [{ tag: "value" }, { tag: "value" }],
      [new IRSendExpr(`${selector}:`, $1, [new IRValueArg($0)])]
    )
  }

  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.addFrame(
    ":",
    [{ tag: "do" }],
    [
      new IRSendExpr(
        selector,
        $0,
        args.map((_, index) => new IRValueArg(new IRIvarExpr(index)))
      ),
    ]
  )

  // utility methods
  // TODO: could you write, like, a macro system to generate these?
  // TODO: when these conflict with fields, which should take precedence?
  if (!frameClass.try("=:")) {
    /*
    frame equality for [x:y:]
    on {=: other}
      other{:
        on {x: x' y: y'}
          (x = x') && (y = y')
      } ? false
    */
    const eqParams: IRParam[] = args.map(() => ({ tag: "value" }))
    const eqClass = new IRClassBuilder()
      .add(
        selector,
        new IROnBlockHandler(0, eqParams, [
          args.reduce((prev, _, i) => {
            const myValue = new IRIvarExpr(i)
            const theirValue = new IRLocalExpr(i)
            const isEqual = new IRSendExpr("=:", myValue, [
              new IRValueArg(theirValue),
            ])
            return new IRSendExpr("&&:", prev, [new IRValueArg(isEqual)])
          }, trueVal as IRExpr),
        ])
      )
      .addElse(new IRElseBlockHandler([falseVal]))
    frameClass.addFrame(
      "=:",
      [{ tag: "do" }],
      [new IRTrySendExpr(":", $0, [new IRDoArg(eqClass)], falseVal)]
    )
  }

  if (!frameClass.try("!=:")) {
    const eqParams: IRParam[] = args.map(() => ({ tag: "value" }))
    const notEqClass = new IRClassBuilder()
      .add(
        selector,
        new IROnBlockHandler(0, eqParams, [
          args.reduce((prev, _, i) => {
            const myValue = new IRIvarExpr(i)
            const theirValue = new IRLocalExpr(i)
            const isEqual = new IRSendExpr("=:", myValue, [
              new IRValueArg(theirValue),
            ])
            return new IRSendExpr("&&:", prev, [new IRValueArg(isEqual)])
          }, trueVal as IRExpr),
        ])
      )
      .addElse(new IRElseBlockHandler([falseVal]))
    frameClass.addFrame(
      "!=:",
      [{ tag: "do" }],
      [
        new IRSendExpr(
          "!",
          new IRTrySendExpr(":", $0, [new IRDoArg(notEqClass)], falseVal),
          []
        ),
      ]
    )
  }

  if (!frameClass.try("debug")) {
    // TODO: recur through args
    frameClass.addFrame(
      "debug",
      [],
      [new PrimitiveValue(stringClass, `[${selector}]`)]
    )
  }

  if (!frameClass.try("hash")) {
    frameClass.addFrame(
      "hash",
      [],
      [
        args.reduce(
          (acc, _, i) =>
            new IRSendDirectExpr("^:", intClass.get("^:"), acc, [
              new IRValueArg(new IRSendExpr("hash", new IRIvarExpr(i), [])),
            ]),
          new IRSendDirectExpr(
            "hash",
            stringClass.get("hash"),
            new PrimitiveValue(stringClass, selector),
            []
          )
        ),
      ]
    )
  }

  frameCache.set(selector, frameClass)
  return constObject(frameClass, ivars)
}
