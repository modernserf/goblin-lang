import { IRClass, IRExpr } from "./interpreter"

const frameCache = new Map<string, IRClass>()
export function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return { tag: "object", ivars, class: cachedClass }

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
    params: [{ tag: "block" }],
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
    // getter: [x: 1 y: 2]{x}
    frameClass.handlers.set(key, {
      tag: "object",
      params: [],
      body: [{ tag: "return", value: { tag: "ivar", index } }],
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
                return { tag: "local", index: 0 }
              } else {
                return { tag: "ivar", index }
              }
            }),
          },
        },
      ],
    })
  }
  frameCache.set(selector, frameClass)
  return { tag: "object", ivars, class: frameClass }
}
