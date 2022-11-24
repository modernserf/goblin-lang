import { ParseExpr } from "./interface"

export class InvalidBlockArgError {}
export class InvalidLetBindingError {}
export class InvalidSetTargetError {}
export class InvalidVarBindingError {}
export class InvalidImportBindingError {}
export class InvalidImportSourceError {}
export class InvalidDestructuringError {}
export class InvalidFrameArgError {}
export class InvalidProvideBindingError {}
export class DuplicateHandlerError {
  constructor(readonly selector: string) {}
}
export class DuplicateElseHandlerError {
  constructor(readonly selector: string) {}
}
export class DuplicateKeyError {
  constructor(readonly key: string) {}
}
export class RedundantTrySendError {
  constructor(readonly target: ParseExpr, selector: string) {}
}
export class InvalidElseParamsError {
  constructor(readonly selector: string) {}
}
export class IncompleteHandlerError {
  constructor(readonly selector: string) {}
}

// TODO: RuntimeError should collect _goblin_ stack traces, not JS
export class RuntimeError extends Error {}

export class NoHandlerError extends RuntimeError {
  constructor(readonly selector: string) {
    super(`No handler for ${selector}`)
  }
}
export class NoProviderError extends RuntimeError {
  constructor(readonly key: string) {
    super(`No provider for ${key}`)
  }
}
export class ArgMismatchError extends RuntimeError {
  constructor(readonly paramType: string, readonly argType: string) {
    super(`Expected ${paramType}, received ${argType}`)
  }
}

// These errors indicate logic bugs in the compiler/interpreter, not in the code
export class UnreachableError extends Error {}
