import { Debugger, debug } from 'debug'
import { Disposable } from './utils/Disposable'
import { ObservableEmitter } from './utils/ObservableEmitter'

export type InterceptorEventMap = Record<string, (...args: any[]) => void>

export function getGlobalSymbol<V>(symbol: Symbol): V | undefined {
  return (
    // @ts-ignore https://github.com/Microsoft/TypeScript/issues/24587
    globalThis[symbol] || undefined
  )
}

function setGlobalSymbol(symbol: Symbol, value: any): void {
  // @ts-ignore
  globalThis[symbol] = value
}

export function deleteGlobalSymbol(symbol: Symbol): void {
  // @ts-ignore
  delete globalThis[symbol]
}

export enum InterceptorReadyState {
  IDLE = 'IDLE',
  APPLIED = 'APPLIED',
  DISPOSED = 'DISPOSED',
}

export type ExtractEventNames<EventMap extends Record<string, any>> =
  EventMap extends Record<infer EventName, any> ? EventName : never

export class Interceptor<
  EventMap extends InterceptorEventMap
> extends Disposable {
  protected log: Debugger
  protected emitter: ObservableEmitter<EventMap>

  protected readyState: InterceptorReadyState

  constructor(private readonly symbol: Symbol) {
    super()

    this.log = debug(symbol.description!)
    this.readyState = InterceptorReadyState.IDLE

    this.emitter = new ObservableEmitter(symbol.description!)

    // Do not limit the maximum number of listeners
    // so not to limit the maximum amount of parallel events emitted.
    // this.emitter.setMaxListeners(0)
    this.subscriptions.push(() => this.emitter.removeAllListeners())

    this.log('constructing the interceptor...')
  }

  /**
   * Determine if this interceptor can be applied
   * in the current environment.
   */
  protected checkEnvironment(): boolean {
    return true
  }

  /**
   * Apply this interceptor to the current process.
   * Returns an already running interceptor instance if it's present.
   */
  public apply(): void {
    const log = this.log.extend('apply')
    log('applying the interceptor...')

    // Ignore calling ".apply()" multiple times.
    if (this.readyState === InterceptorReadyState.APPLIED) {
      log('intercepted already applied!')
      return
    }

    // Check that the interceptor can be applied in the current environment.
    if (!this.checkEnvironment()) {
      log('the interceptor cannot be applied in this environment!')
      return
    }

    // Whenever applying a new interceptor, check if it hasn't been applied already.
    // This prevents multiple interceptors of the same class from patching modules
    // multiple times within the same process.
    const runningInstance = this.hydrateInstance()

    if (runningInstance) {
      log('found a running instance, reusing...')

      // Proxy any listeners you set on this instance to the running instance.
      this.on = (event, listener) => {
        log('proxying the "%s" listener', event)

        // Add listeners to the running instance so they appear
        // at the top of the event listeners list and are executed first.
        runningInstance.emitter.addListener(event, listener)

        // Ensure that once this interceptor instance is disposed,
        // it removes all listeners it has appended to the running interceptor instance.
        this.subscriptions.push(() => {
          runningInstance.emitter.removeListener(event, listener)
          log('removed proxied "%s" listener!', event)
        })
      }

      this.readyState = InterceptorReadyState.APPLIED

      return
    }

    log('no running instance found, setting up a new instance...')

    // Setup the interceptor.
    this.setup()

    // Store the newly applied interceptor instance globally.
    this.persistInstance()
    this.subscriptions.push(() => this.clearInstance())

    this.readyState = InterceptorReadyState.APPLIED
  }

  /**
   * Setup the module augments and stubs necessary for this interceptor.
   * This method is not run if there's an already running interceptor instance
   * to prevent instantiating the same interceptor multiple times.
   */
  protected setup(): void {}

  /**
   * Listen to the interceptor's public events.
   */
  public on<Event extends ExtractEventNames<EventMap>>(
    event: Event,
    listener: EventMap[Event]
  ): void {
    const log = this.log.extend('on')

    if (this.readyState === InterceptorReadyState.DISPOSED) {
      log('cannot listen to events, already disposed!')
      return
    }

    log('adding "%s" event listener:', event, listener.name, new Error().stack)
    this.emitter.on(event, listener)
  }

  /**
   * Dispose of all side-effects introduced by this interceptor.
   */
  public dispose(): void {
    const log = this.log.extend('dispose')

    if (this.readyState === InterceptorReadyState.DISPOSED) {
      log('cannot dispose, already disposed!')
      return
    }

    log('disposing the interceptor...')
    super.dispose()
    this.readyState = InterceptorReadyState.DISPOSED
  }

  private hydrateInstance(): this | undefined {
    const instance = getGlobalSymbol<this>(this.symbol)
    this.log('retrieved global instance:', instance?.constructor?.name)
    return instance
  }

  private persistInstance(): void {
    setGlobalSymbol(this.symbol, this)
    this.log('set global instance!', this.symbol.description)
  }

  private clearInstance(): void {
    deleteGlobalSymbol(this.symbol)
    this.log('cleared global instance!', this.symbol.description)
  }
}
