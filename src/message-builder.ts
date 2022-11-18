import { DuplicateKeyError } from "./error"

export interface Builder<In, Item, Container> {
  pair(key: string, value: In): Item
  build(selector: string, values: Item[]): Container
}

export function build<In, Item, Container>(
  pairs: { key: string; value: In }[],
  builder: Builder<In, Item, Container>
): Container {
  const map = new Map<string, Item>()

  for (const param of pairs) {
    if (map.has(param.key)) throw new DuplicateKeyError(param.key)
    map.set(param.key, builder.pair(param.key, param.value))
  }

  const sortedKeys = Array.from(map.keys()).sort()
  const selector = sortedKeys.map((k) => `${k}:`).join("")
  const values = sortedKeys.map((k) => map.get(k)!)
  return builder.build(selector, values)
}
