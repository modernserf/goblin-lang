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
export class DuplicateElseHandlerError {}
export class DuplicateKeyError {
  constructor(readonly key: string) {}
}
export class RedundantTrySendError {}

// TODO: RuntimeError base class
export class NoHandlerError {
  constructor(readonly selector: string) {}
}
export class NoProviderError {
  constructor(readonly key: string) {}
}
export class ArgMismatchError {
  constructor(readonly paramType: string, readonly argType: string) {}
}
