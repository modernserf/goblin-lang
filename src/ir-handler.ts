import {
  ArgMismatchError,
  DuplicateElseHandlerError,
  DuplicateHandlerError,
  IncompleteHandlerError,
  InvalidElseParamsError,
  UnreachableError,
} from "./error"
import {
  Interpreter,
  IRArg,
  IRHandler,
  IRParam,
  IRStmt,
  Value,
  ParseParam,
  IRExpr,
  IHandlerBuilder,
  Instance,
  ParseStmt,
  ParseBinding,
  ParamBinding,
  Scope,
  PartialHandler,
  SendScope,
} from "./interface"

import {
  IRLocalExpr,
  IRSelfExpr,
  IRSendDirectExpr,
  IRSendExpr,
} from "./ir-expr"
import { body, Return } from "./ir-stmt"
import { LetStmt } from "./stmt"
import { ObjectValue, unit, DoValue, IRClass } from "./value"

class IRClassBuilder {
  private partials = new Map<string, PartialHandler[]>()
  private handlers = new Map<string, IRHandler>()
  private elsePartials: PartialHandler[] = []
  private elseHandler: IRHandler | null = null
  add(selector: string, handler: IRHandler): this {
    if (this.handlers.has(selector)) throw new DuplicateHandlerError(selector)
    this.handlers.set(selector, handler)
    return this
  }
  addPartial(selector: string, partial: PartialHandler): this {
    const arr = this.partials.get(selector) || []
    arr.push(partial)
    this.partials.set(selector, arr)
    return this
  }
  addFinal(
    selector: string,
    scope: Scope,
    body: ParseStmt[],
    getHandler: (body: IRStmt[]) => IRHandler
  ): this {
    const partials = this.partials.get(selector) || []
    this.partials.delete(selector)
    const fullBody = this.foldPartials(partials, scope, body)
    return this.add(selector, getHandler(fullBody))
  }
  addElse(
    selector: string,
    scope: Scope,
    body: ParseStmt[],
    getHandler: (body: IRStmt[]) => IRHandler
  ): this {
    if (this.elseHandler) throw new DuplicateElseHandlerError(selector)
    const fullBody = this.foldPartials(this.elsePartials, scope, body)
    this.elseHandler = getHandler(fullBody)
    return this
  }
  private foldPartials(
    partials: PartialHandler[],
    scope: Scope,
    body: ParseStmt[]
  ) {
    return partials
      .reduceRight((ifFalse, partial) => partial.cond(ifFalse), body)
      .flatMap((p) => p.compile(scope))
  }
  build(scope: Scope): IRClass {
    if (this.elseHandler) {
      for (const [selector, [value]] of this.partials.entries()) {
        this.closePartial(selector, scope, value)
      }
    }

    for (const [key] of this.partials) {
      throw new IncompleteHandlerError(key)
    }

    return new IRClass(this.handlers, this.elseHandler)
  }
  private closePartial(selector: string, scope: Scope, value: PartialHandler) {
    const params = value.params.map((p) => p.toIR())
    // TODO:is there a better way to do this?
    const args = params.map((_, i) => new IRValueArg(new IRLocalExpr(i)))
    const sendElse = new IRSendDirectExpr(
      selector,
      this.elseHandler!,
      IRSelfExpr,
      args
    )
    this.addFinal(
      selector,
      scope,
      [{ compile: () => [sendElse] }],
      (body) => new IROnHandler(params, body)
    )
  }
}

export class HandlerBuilder implements IHandlerBuilder {
  private cls = new IRClassBuilder()
  constructor(private instance: Instance, private selfBinding: ParseBinding) {}
  build(scope: Scope) {
    return this.cls.build(scope)
  }
  addPartial(selector: string, handler: PartialHandler): void {
    this.cls.addPartial(selector, handler)
  }
  addOn(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void {
    const { scope, head } = this.scopeHead(params, bindings)
    this.cls.addFinal(selector, scope, body, (body) =>
      this.onHandler(params, head, body)
    )
  }
  addElse(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void {
    const { scope, head } = this.scopeHead(params, bindings)
    this.cls.addElse(selector, scope, body, (body) =>
      this.elseHandler(
        selector,
        params.map((p) => p.toIR()),
        head.concat(body)
      )
    )
  }
  private scopeHead(params: ParseParam[], bindings: ParamBinding[]) {
    const scope = this.instance.handlerScope(params.length)
    const head = [
      ...this.selfBinding.selfBinding(scope),
      ...params.flatMap((p, i) => p.handler(scope, i)),
      ...bindings.flatMap(({ binding, value }) =>
        new LetStmt(binding, value, false).compile(scope)
      ),
    ]
    return { scope, head }
  }
  private onHandler(params: ParseParam[], head: IRStmt[], body: IRStmt[]) {
    // ignore head (which contains maybe unused self-binding & params), just look at body
    if (body.length === 0) return NilHandler
    if (body[0].toHandler) return body[0].toHandler()

    return new IROnHandler(
      params.map((p) => p.toIR()),
      head.concat(body)
    )
  }
  private elseHandler(
    selector: string,
    params: IRParam[],
    body: IRStmt[]
  ): IRHandler {
    switch (selector) {
      case "":
        return new IRElseHandler(body)
      case ":":
        return new IRForwardHandler(params, body)
      default:
        throw new InvalidElseParamsError(selector)
    }
  }
}

export class BlockHandlerBuilder implements IHandlerBuilder {
  private cls = new IRClassBuilder()
  private scope = this.inScope.blockBodyScope()
  private paramScope = this.scope.blockParamsScope()
  constructor(private inScope: SendScope) {}
  build(scope: Scope) {
    return this.cls.build(scope)
  }
  addPartial(selector: string, handler: PartialHandler): void {
    this.cls.addPartial(selector, handler)
  }
  addOn(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void {
    const { offset, head } = this.offsetHead(params, bindings)
    this.cls.addFinal(selector, this.scope, body, (body) =>
      this.onHandler(
        offset,
        params.map((p) => p.toIR()),
        head,
        body
      )
    )
  }
  addElse(
    selector: string,
    params: ParseParam[],
    bindings: ParamBinding[],
    body: ParseStmt[]
  ): void {
    const { offset, head } = this.offsetHead(params, bindings)
    this.cls.addElse(selector, this.scope, body, (body) =>
      this.elseHandler(
        selector,
        offset,
        params.map((p) => p.toIR()),
        head.concat(body)
      )
    )
  }
  private offsetHead(params: ParseParam[], bindings: ParamBinding[]) {
    const offset = this.scope.locals.allocate(params.length)
    const head = [
      ...params.flatMap((p, i) => p.handler(this.paramScope, offset + i)),
      ...bindings.flatMap(({ binding, value }) =>
        new LetStmt(binding, value, false).compile(this.scope)
      ),
    ]
    return { offset, head }
  }
  private onHandler(
    offset: number,
    params: IRParam[],
    head: IRStmt[],
    body: IRStmt[]
  ) {
    return new IROnBlockHandler(offset, params, head.concat(body))
  }
  private elseHandler(
    selector: string,
    offset: number,
    params: IRParam[],
    body: IRStmt[]
  ): IRHandler {
    switch (selector) {
      case "":
        return new IRElseBlockHandler(body)
      case ":":
        return new IRForwardBlockHandler(offset, params, body)
      default:
        throw new InvalidElseParamsError(selector)
    }
  }
}

export class IRValueArg implements IRArg {
  constructor(private expr: IRExpr) {}
  value(ctx: Interpreter): Value {
    return this.expr.eval(ctx)
  }
  evalInner(ctx: Interpreter): IRArg {
    return new IRValueArg(this.expr.eval(ctx))
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag === "var") throw new ArgMismatchError(param.tag, "value")
    target.setLocal(offset, this.expr.eval(sender))
  }
  unload() {} // noop
}

export class IRVarArg implements IRArg {
  constructor(private index: number) {}
  /* istanbul ignore next */
  value(ctx: Interpreter): Value {
    throw "todo: handle var args in primitive fns"
  }
  /* istanbul ignore next */
  evalInner(ctx: Interpreter): IRArg {
    throw "todo: handle var args in message propagation"
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag !== "var") throw new ArgMismatchError(param.tag, "var")
    target.setLocal(offset, sender.getLocal(this.index))
  }
  unload(sender: Interpreter, target: Interpreter, offset: number): void {
    const result = target.getLocal(offset)
    sender.setLocal(this.index, result)
  }
}

export class IRDoArg implements IRArg {
  constructor(private cls: IRClass) {}
  value(ctx: Interpreter): Value {
    return new DoValue(this.cls, ctx)
  }
  /* istanbul ignore next */
  evalInner(ctx: Interpreter): IRArg {
    throw new Error("unreachable, maybe")
  }
  load(
    sender: Interpreter,
    target: Interpreter,
    offset: number,
    param: IRParam
  ): void {
    if (param.tag !== "do") throw new ArgMismatchError(param.tag, "do")
    target.setLocal(offset, new DoValue(this.cls, sender))
  }
  unload() {} // noop
}

function loadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  params: IRParam[],
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    const param = params[i]
    /* istanbul ignore next */
    if (!param) throw new Error("missing param")
    arg.load(sender, target, offset + i, param)
  })
}

function unloadArgs(
  sender: Interpreter,
  target: Interpreter,
  offset: number,
  args: IRArg[]
) {
  args.forEach((arg, i) => {
    arg.unload(sender, target, offset + i)
  })
}

export class IROnHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const ctx = target.context(sender)
    loadArgs(sender, ctx, 0, this.params, args)
    try {
      return Return.handleReturn(ctx, () => body(ctx, this.body))
    } finally {
      unloadArgs(sender, ctx, 0, args)
    }
  }
}

export class IRGetterHandler implements IRHandler {
  constructor(private index: number) {}
  send(_: Interpreter, target: Value): Value {
    return target.getIvar(this.index)
  }
}

export class IRConstHandler implements IRHandler {
  constructor(private value: Value) {}
  send(): Value {
    return this.value
  }
}

const NilHandler = new IRConstHandler(unit)

export class IRPrimitiveHandler implements IRHandler {
  constructor(
    private fn: (value: any, args: Value[], ctx: Interpreter) => Value
  ) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    return this.fn(
      target.primitiveValue,
      args.map((arg) => arg.value(sender)),
      target.context(sender)
    )
  }
}

export class IRLazyHandler implements IRHandler {
  private handler: IRHandler | null = null
  replace(handler: IRHandler) {
    this.handler = handler
  }
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    /* istanbul ignore next */
    if (!this.handler) throw new UnreachableError("lazy handler not replaced")
    return this.handler.send(sender, target, selector, args)
  }
}

export class IRElseHandler implements IRHandler {
  constructor(private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const ctx = target.context(sender)
    return Return.handleReturn(ctx, () => body(ctx, this.body))
  }
}

function messageForwarder(
  ctx: Interpreter,
  selector: string,
  args: IRArg[]
): IRArg[] {
  const argsWithValues = args.map((arg) => arg.evalInner(ctx))
  const cls = new IRClass(
    new Map([
      [
        ":",
        new IROnHandler(
          [{ tag: "do" }],
          [new IRSendExpr(selector, new IRLocalExpr(0), argsWithValues)]
        ),
      ],
    ]),
    null
  )
  return [new IRValueArg(new ObjectValue(cls, []))]
}

export class IRForwardHandler implements IRHandler {
  constructor(private params: IRParam[], private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    originalArgs: IRArg[]
  ): Value {
    const args = messageForwarder(sender, selector, originalArgs)
    const ctx = target.context(sender)
    loadArgs(sender, ctx, 0, this.params, args)
    try {
      return Return.handleReturn(ctx, () => body(ctx, this.body))
    } finally {
      unloadArgs(sender, ctx, 0, args)
    }
  }
}

// Block handlers

export class IROnBlockHandler implements IRHandler {
  constructor(
    private offset: number,
    private params: IRParam[],
    private body: IRStmt[]
  ) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const ctx = target.context(sender)
    loadArgs(sender, ctx, this.offset, this.params, args)
    const result = body(ctx, this.body)
    unloadArgs(sender, ctx, this.offset, args)
    return result
  }
}

export class IRForwardBlockHandler implements IRHandler {
  constructor(
    private offset: number,
    private params: IRParam[],
    private body: IRStmt[]
  ) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    originalArgs: IRArg[]
  ): Value {
    const ctx = target.context(sender)
    const args = messageForwarder(sender, selector, originalArgs)
    loadArgs(sender, ctx, this.offset, this.params, args)
    const result = body(ctx, this.body)
    unloadArgs(sender, ctx, this.offset, args)
    return result
  }
}

export class IRElseBlockHandler implements IRHandler {
  constructor(private body: IRStmt[]) {}
  send(
    sender: Interpreter,
    target: Value,
    selector: string,
    args: IRArg[]
  ): Value {
    const ctx = target.context(sender)
    return body(ctx, this.body)
  }
}
