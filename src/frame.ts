import { IRClass, IRExpr, IRStmt } from "./ir"

const frameCache = new Map<string, IRClass>()
export function frame(
  selector: string,
  args: { key: string; value: IRExpr }[]
): IRExpr {
  const ivars = args.map((arg) => arg.value)
  const cachedClass = frameCache.get(selector)
  if (cachedClass) return { tag: "object", ivars, class: cachedClass }

  const frameClass: IRClass = new Map()
  // constructor: [x: 1 y: 2]{x: 3 y: 4}
  frameClass.set(selector, {
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
    effects: [],
  })
  // matcher: [x: 1 y: 2]{: target} => target{x: 1 y: 2}
  frameClass.set(":", {
    body: [
      {
        tag: "return",
        value: {
          tag: "call",
          selector: selector,
          target: { tag: "local", index: 0 },
          args: args.map((_, index) => ({
            tag: "value",
            value: { tag: "ivar", index },
          })),
        },
      },
    ],
    effects: [],
  })
  for (const [index, { key }] of args.entries()) {
    // getter: [x: 1 y: 2]{x}
    frameClass.set(key, {
      body: [{ tag: "return", value: { tag: "ivar", index } }],
      effects: [],
    })
    // setter: [x: 1 y: 2]{x: 3}
    frameClass.set(`${key}:`, {
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
      effects: [],
    })
  }
  frameCache.set(selector, frameClass)
  return { tag: "object", ivars, class: frameClass }
}
