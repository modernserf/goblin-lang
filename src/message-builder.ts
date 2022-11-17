import { ParsePair } from "./interface"
import { DuplicateKeyError } from "./error"

export interface Builder<In, Item, Container> {
  punValue(key: string): Item
  pair(key: string, value: In): Item
  build(selector: string, values: Item[]): Container
}

export function build<In, Item, Container>(
  pairs: ParsePair<In>[],
  builder: Builder<In, Item, Container>
): Container {
  const map = new Map<string, Item>()

  for (const param of pairs) {
    if (map.has(param.key)) throw new DuplicateKeyError(param.key)
    switch (param.tag) {
      case "punPair":
        map.set(param.key, builder.punValue(param.key))
        continue
      case "pair":
        map.set(param.key, builder.pair(param.key, param.value))
        continue
    }
  }

  const sortedKeys = Array.from(map.keys()).sort()
  const selector = sortedKeys.map((k) => `${k}:`).join("")
  const values = sortedKeys.map((k) => map.get(k)!)
  return builder.build(selector, values)
}
