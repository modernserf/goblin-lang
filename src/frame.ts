import { IRExpr, IRParam, IRStmt } from "./interface"
import { IRClass } from "./value"
import {
  IRIvarExpr,
  IRLocalExpr,
  IRObjectExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
} from "./ir-expr"
import { IRGetterHandler, IROnHandler, IRValueArg } from "./ir-handler"
import { constObject } from "./optimize"

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
          new IRSelfExpr(),
          [
            new IRValueArg(
              new IRSendExpr(":", $0, [new IRValueArg(new IRIvarExpr(index))])
            ),
          ]
        ),
      ]
    )
  }
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
  if (args.length > 1) {
    frameClass.addFrame(
      selector,
      args.map(() => ({ tag: "value" })),
      [
        new IRObjectExpr(
          frameClass,
          args.map((_, index) => new IRLocalExpr(index))
        ),
      ]
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

  frameCache.set(selector, frameClass)
  return constObject(frameClass, ivars)
}
