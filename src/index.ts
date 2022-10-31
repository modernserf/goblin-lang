import { program } from "./parser-2"
import { Compiler } from "./compiler"
import { Interpreter, Value } from "./interpreter"

export function run(source: string): Value {
  const ast = program.parseString(source)
  const ir = new Compiler().program(ast)
  return new Interpreter().body(ir)
}
