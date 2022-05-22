export function dedent([str]: TemplateStringsArray) {
  const lines = str.split("\n")
  if (lines.length === 1) return str

  lines.shift()
  lines.pop()
  const [tab] = lines[0].match(/^\s+/)!
  const re = new RegExp(`^${tab}`)
  return lines.map((line) => line.replace(re, "")).join("\n")
}
