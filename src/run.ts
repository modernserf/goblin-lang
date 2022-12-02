import { run } from "./index"
import { readFileSync } from "fs"
const file = process.argv[2]
const code = readFileSync(file, { encoding: "utf-8" })
run(code)
