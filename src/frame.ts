import {
  IRClass,
  IRExpr,
  IRIvarExpr,
  IRLocalExpr,
  IRObjectExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
} from "./interpreter"
import { constObject } from "./optimize"

const $0: IRExpr = new IRLocalExpr(0)

const frameCache = new Map<string, IRClass>()
export function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return constObject(cachedClass, ivars)

  const frameClass = new IRClass()
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
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
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.addFrame(
    ":",
    [{ tag: "do" }],
    [
      new IRSendExpr(
        selector,
        $0,
        args.map((_, index) => ({
          tag: "value",
          value: new IRIvarExpr(index),
        }))
      ),
    ]
  )
  for (const [index, { key }] of args.entries()) {
    const ivar: IRExpr = new IRIvarExpr(index)
    // getter: [x: 1 y: 2]{x}
    frameClass.addFrame(key, [], [ivar])
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
        new IRSendDirectExpr(frameClass.get(`${key}:`), new IRSelfExpr(), [
          {
            tag: "value",
            value: new IRSendExpr(":", $0, [{ tag: "value", value: ivar }]),
          },
        ]),
      ]
    )
  }
  frameCache.set(selector, frameClass)
  return constObject(frameClass, ivars)
}
