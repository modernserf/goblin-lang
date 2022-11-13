import { IRClass, IRExpr } from "./interpreter"
import { constObject } from "./optimize"

const $0: IRExpr = { tag: "local", index: 0 }

const frameCache = new Map<string, IRClass>()
export function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return constObject(cachedClass, ivars)

  const frameClass: IRClass = { handlers: new Map(), else: null }
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
  frameClass.handlers.set(selector, {
    tag: "object",
    params: args.map(() => ({ tag: "value" })),
    body: [
      {
        tag: "return",
        value: {
          tag: "object",
          class: frameClass,
          ivars: args.map((_, index) => ({ tag: "local", index })),
        },
      },
    ],
  })
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.handlers.set(":", {
    tag: "object",
    params: [{ tag: "do" }],
    body: [
      {
        tag: "return",
        value: {
          tag: "send",
          selector: selector,
          target: { tag: "local", index: 0 },
          args: args.map((_, index) => ({
            tag: "value",
            value: { tag: "ivar", index },
          })),
        },
      },
    ],
  })
  for (const [index, { key }] of args.entries()) {
    const ivar: IRExpr = { tag: "ivar", index }
    // getter: [x: 1 y: 2]{x}
    frameClass.handlers.set(key, {
      tag: "object",
      params: [],
      body: [{ tag: "return", value: ivar }],
    })
    // setter: [x: 1 y: 2]{x: 3}
    frameClass.handlers.set(`${key}:`, {
      tag: "object",
      params: [{ tag: "value" }],
      body: [
        {
          tag: "return",
          value: {
            tag: "object",
            class: frameClass,
            ivars: args.map((_, j) => {
              if (j === index) {
                return $0
              } else {
                return { tag: "ivar", index: j }
              }
            }),
          },
        },
      ],
    })
    // updater: [x: 1 y: 2]{->x: {:x} x + 1}
    // [on {->x: do f} self{x: f{: x}}]
    frameClass.handlers.set(`-> ${key}:`, {
      tag: "object",
      params: [{ tag: "do" }],
      body: [
        {
          tag: "return",
          value: {
            tag: "sendDirect",
            handler: frameClass.handlers.get(`${key}:`)!,
            target: { tag: "self" },
            args: [
              {
                tag: "value",
                value: {
                  tag: "send",
                  selector: ":",
                  target: $0,
                  args: [{ tag: "value", value: ivar }],
                },
              },
            ],
          },
        },
      ],
    })
  }
  frameCache.set(selector, frameClass)
  return constObject(frameClass, ivars)
}
