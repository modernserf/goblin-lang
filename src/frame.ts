import {
  IRClass,
  IRExpr,
  IRHandler,
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

  // adding to map instead of directly to class because we want to overwrite previous methods
  const handlers = new Map<string, IRHandler>()
  const frameClass = new IRClass(handlers)
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
  handlers.set(selector, {
    tag: "object",
    params: args.map(() => ({ tag: "value" })),
    body: [
      new IRObjectExpr(
        frameClass,
        args.map((_, index) => new IRLocalExpr(index))
      ),
    ],
  })
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  handlers.set(":", {
    tag: "object",
    params: [{ tag: "do" }],
    body: [
      new IRSendExpr(
        selector,
        $0,
        args.map((_, index) => ({
          tag: "value",
          value: new IRIvarExpr(index),
        }))
      ),
    ],
  })
  for (const [index, { key }] of args.entries()) {
    const ivar: IRExpr = new IRIvarExpr(index)
    // getter: [x: 1 y: 2]{x}
    handlers.set(key, {
      tag: "object",
      params: [],
      body: [ivar],
    })
    // setter: [x: 1 y: 2]{x: 3}
    handlers.set(`${key}:`, {
      tag: "object",
      params: [{ tag: "value" }],
      body: [
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
      ],
    })
    // updater: [x: 1 y: 2]{->x: {:x} x + 1}
    // [on {->x: do f} self{x: f{: x}}]
    handlers.set(`-> ${key}:`, {
      tag: "object",
      params: [{ tag: "do" }],
      body: [
        new IRSendDirectExpr(handlers.get(`${key}:`)!, new IRSelfExpr(), [
          {
            tag: "value",
            value: new IRSendExpr(":", $0, [{ tag: "value", value: ivar }]),
          },
        ]),
      ],
    })
  }
  frameCache.set(selector, frameClass)
  return constObject(frameClass, ivars)
}
