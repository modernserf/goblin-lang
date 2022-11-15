// interface RuntimeError {}

// class Locals {
//   private locals: Value[] = []
//   set(index: number, value: Value) {
//     this.locals[index] = value
//   }
//   get(index: number): Value {
//     const result = this.locals[index]
//     /* istanbul ignore next */
//     if (!result) {
//       throw new Error(`missing local ${index}`)
//     }
//     return result
//   }
// }

// class Instance {
//   constructor(readonly self: Value, private ivars: Value[]) {}
//   static root() {
//     return new Instance(unit, [])
//   }
//   get(index: number): Value {
//     const result = this.ivars[index]
//     /* istanbul ignore next */
//     if (!result) {
//       throw new Error(`missing ivar ${index}`)
//     }
//     return result
//   }
// }

// export class NoProviderError implements RuntimeError {
//   constructor(readonly key: string) {}
// }

// class ProvideCtx {
//   static root(): ProvideCtx {
//     return new ProvideCtx(new Map())
//   }
//   private constructor(private scope: Map<string, Value>) {}
//   use(key: string): Value {
//     const res = this.scope.get(key)
//     if (!res) throw new NoProviderError(key)
//     return res
//   }
//   provide(key: string, value: Value): ProvideCtx {
//     const next = new Map(this.scope)
//     next.set(key, value)
//     return new ProvideCtx(next)
//   }
// }

// class DeferStack {
//   private defers: IRBody[] = []
//   defer(body: IRBody) {
//     this.defers.push(body)
//   }
//   unwind(state: State) {
//     // TODO: should this be reverse order?
//     for (const defer of this.defers) {
//       defer.eval(state)
//     }
//   }
// }

// interface Modules {
//   get(key: string): Value
// }

// interface State {
//   getLocal(index: number): Value
//   setLocal(index: number, value: Value): void
//   getIvar(index: number): Value
//   getSelf(): Value
//   provideCtx(key: string, value: Value): void
//   useCtx(key: string): Value
//   defer(body: IRBody): void
//   unwindDefer(): void
//   getModule(key: string): Value
//   createScope(instance: Instance): State
// }

// class StateImpl implements State {
//   static root(modules: Modules): State {
//     return new StateImpl(
//       new Locals(),
//       Instance.root(),
//       ProvideCtx.root(),
//       new DeferStack(),
//       modules
//     )
//   }
//   private constructor(
//     private locals: Locals,
//     private instance: Instance,
//     private context: ProvideCtx,
//     private defers: DeferStack,
//     private modules: Modules
//   ) {}
//   getLocal(index: number): Value {
//     return this.locals.get(index)
//   }
//   setLocal(index: number, value: Value): void {
//     return this.locals.set(index, value)
//   }
//   getIvar(index: number): Value {
//     return this.instance.get(index)
//   }
//   getSelf(): Value {
//     return this.instance.self
//   }
//   provideCtx(key: string, value: Value): void {
//     this.context = this.context.provide(key, value)
//   }
//   useCtx(key: string): Value {
//     return this.context.use(key)
//   }
//   defer(body: IRBody): void {
//     this.defers.defer(body)
//   }
//   unwindDefer(): void {
//     this.defers.unwind(this)
//   }
//   getModule(key: string): Value {
//     return this.modules.get(key)
//   }
//   createScope(instance: Instance): State {
//     return new StateImpl(
//       new Locals(),
//       instance,
//       this.context,
//       new DeferStack(),
//       this.modules
//     )
//   }
// }

// interface SendArgs {
//   load(state: State, params: IRParams): void
//   unload(parent: State, child: State): void
//   primitive(state: State): Value[]
// }

// interface Value {
//   readonly primitiveValue: any
//   send(state: State, selector: string, args: SendArgs): Value
//   sendDirect(state: State, handler: IRHandler, args: SendArgs): Value
// }

// export class PrimitiveValue implements Value, IRExpr, IRStmt {
//   constructor(readonly primitiveValue: any, private cls: IRClass) {}
//   eval(state: State): Value {
//     return this
//   }
//   send(state: State, selector: string, args: SendArgs): Value {
//     const handler = this.cls.get(selector)
//     const instance = new Instance(this, [])
//     return handler.send(state, instance, args)
//   }
//   sendDirect(state: State, handler: IRHandler, args: SendArgs): Value {
//     const instance = new Instance(this, [])
//     return handler.send(state, instance, args)
//   }
// }

// export class ObjectValue implements Value, IRExpr, IRStmt {
//   readonly primitiveValue = null
//   constructor(private cls: IRClass, private ivars: Value[]) {}
//   eval(state: State): Value {
//     return this
//   }
//   send(state: State, selector: string, args: SendArgs): Value {
//     const handler = this.cls.get(selector)
//     const instance = new Instance(this, this.ivars)
//     return handler.send(state, instance, args)
//   }
//   sendDirect(state: State, handler: IRHandler, args: SendArgs): Value {
//     const instance = new Instance(this, this.ivars)
//     return handler.send(state, instance, args)
//   }
// }

// export interface IRStmt {
//   eval(state: State): Value | void
// }

// class Return {
//   constructor(private state: State, private value: Value) {}
//   static handleReturn(state: State, fn: () => Value): Value {
//     try {
//       return fn()
//     } catch (e) {
//       if (e instanceof Return && e.state === state) {
//         return e.value
//       } else {
//         throw e
//       }
//     }
//   }
// }

// export class IRAssign implements IRStmt {
//   constructor(private index: number, private expr: IRExpr) {}
//   eval(state: State) {
//     state.setLocal(this.index, this.expr.eval(state))
//   }
// }
// export class IRReturn implements IRStmt {
//   constructor(private expr: IRExpr) {}
//   eval(state: State) {
//     throw new Return(state, this.expr.eval(state))
//   }
// }
// export class IRProvide implements IRStmt {
//   constructor(private key: string, private expr: IRExpr) {}
//   eval(state: State) {
//     state.provideCtx(this.key, this.expr.eval(state))
//   }
// }
// export class IRDefer implements IRStmt {
//   constructor(private body: IRBody) {}
//   eval(state: State): void {
//     state.defer(this.body)
//   }
// }

// export class IRBody {
//   constructor(private body: IRStmt[]) {}
//   eval(state: State): Value {
//     try {
//       let result = unit
//       for (const stmt of this.body) {
//         result = stmt.eval(state) || unit
//       }
//       return result
//     } finally {
//       state.unwindDefer()
//     }
//   }
// }

// export class IRProgram {
//   constructor(private body: IRBody, private modules: Modules) {}
//   eval(): Value {
//     const state = StateImpl.root(this.modules)
//     return this.body.eval(state)
//   }
// }

// export interface IRExpr {
//   eval(state: State): Value
// }

// export class IRLocal implements IRExpr, IRStmt {
//   constructor(private index: number) {}
//   eval(state: State): Value {
//     return state.getLocal(this.index)
//   }
// }

// export class IRIval implements IRExpr, IRStmt {
//   constructor(private index: number) {}
//   eval(state: State): Value {
//     return state.getIvar(this.index)
//   }
// }

// export class IRSelf implements IRExpr, IRStmt {
//   eval(state: State): Value {
//     return state.getSelf()
//   }
// }

// export class IRObject implements IRExpr, IRStmt {
//   constructor(private cls: IRClass, private ivars: IRExpr[]) {}
//   eval(state: State): Value {
//     return new ObjectValue(
//       this.cls,
//       this.ivars.map((ivar) => ivar.eval(state))
//     )
//   }
// }

// export class IRSend implements IRExpr, IRStmt {
//   constructor(
//     private selector: string,
//     private target: IRExpr,
//     private args: IRArgs
//   ) {}
//   eval(state: State): Value {
//     const target = this.target.eval(state)
//     return target.send(state, this.selector, this.args.eval(state))
//   }
// }

// export class IRSendDirect implements IRExpr, IRStmt {
//   constructor(
//     private handler: IRHandler,
//     private target: IRExpr,
//     private args: IRArgs
//   ) {}
//   eval(state: State): Value {
//     const target = this.target.eval(state)
//     return target.sendDirect(state, this.handler, this.args.eval(state))
//   }
// }

// export class IRUsing implements IRExpr, IRStmt {
//   constructor(private key: string) {}
//   eval(state: State): Value {
//     return state.useCtx(this.key)
//   }
// }

// export class IRModule implements IRExpr, IRStmt {
//   constructor(private key: string) {}
//   eval(state: State): Value {
//     return state.getModule(this.key)
//   }
// }

// export class IRArgs {
//   eval(state: State): SendArgs {
//     throw "todo"
//   }
// }

// export class NoHandlerError implements RuntimeError {
//   constructor(readonly selector: string) {}
// }
// export class IRClass {
//   constructor(
//     private handlers: Map<string, IRHandler>,
//     private elseBody: IRBody | null
//   ) {}
//   get(selector: string): IRHandler {
//     const handler = this.handlers.get(selector)
//     if (handler) return handler
//     if (this.elseBody) return new ElseHandler(this.elseBody)
//     throw new NoHandlerError(selector)
//   }
// }

// export interface IRParams {}

// export interface IRHandler {
//   send(parentState: State, instance: Instance, args: SendArgs): Value
// }

// export class ObjectHandler implements IRHandler {
//   constructor(private params: IRParams, private body: IRBody) {}
//   send(parent: State, instance: Instance, args: SendArgs): Value {
//     const child = parent.createScope(instance)
//     args.load(child, this.params)
//     try {
//       return Return.handleReturn(child, () => this.body.eval(child))
//     } finally {
//       args.unload(parent, child)
//     }
//   }
// }

// export class ElseHandler implements IRHandler {
//   constructor(private body: IRBody) {}
//   send(parent: State, instance: Instance, _: SendArgs): Value {
//     const child = parent.createScope(instance)
//     return Return.handleReturn(child, () => this.body.eval(child))
//   }
// }

// export class PrimitiveHandler implements IRHandler {
//   constructor(private fn: (value: any, args: Value[]) => Value) {}
//   send(state: State, instance: Instance, args: SendArgs): Value {
//     return this.fn(instance.self.primitiveValue, args.primitive(state))
//   }
// }

// const unitClass = new IRClass(new Map(), null)
// const unit: Value = new ObjectValue(unitClass, [])
