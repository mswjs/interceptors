import { Debugger, debug } from 'debug'
import { AsyncEventEmitter } from './utils/AsyncEventEmitter'

export type InterceptorEventMap = Record<string, (...args: any[]) => void>
export type InterceptorSubscription = () => void

function getGlobalSymbol<V>(symbol: Symbol): V | undefined {
  return (
    // @ts-ignore https://github.com/Microsoft/TypeScript/issues/24587
    globalThis[symbol] || undefined
  )
}

function setGlobalSymbol(symbol: Symbol, value: any): void {
  // @ts-ignore
  globalThis[symbol] = value
}

function deleteGlobalSymbol(symbol: Symbol): void {
  // @ts-ignore
  delete globalThis[symbol]
}

export class Interceptor<EventMap extends InterceptorEventMap> {
  protected emitter: AsyncEventEmitter<EventMap>
  protected subscriptions: InterceptorSubscription[]
  protected log: Debugger

  constructor(private readonly symbol: Symbol) {
    this.emitter = new AsyncEventEmitter()
    this.subscriptions = []
    this.log = debug(symbol.description!)

    // Do not limit the maximum number of listeners
    // so not to limit the maximum amount of parallel events emitted.
    this.emitter.setMaxListeners(0)

    this.log('constructing the interceptor...')
  }

  /**
   * Apply this interceptor to the current process.
   * Returns an already running interceptor instance if it's present.
   */
  public apply(): void {
    const log = this.log.extend('apply')
    log('applying the interceptor...')

    // Whenever applying a new interceptor, check if it hasn't been applied already.
    // This enables to apply the same interceptor multiple times, for example from a different
    // interceptor, only proxying events but keeping the stubs in a single place.
    const runningInstance = getGlobalSymbol<this>(this.symbol)

    if (runningInstance) {
      log('found a running instance')

      // Proxy any listeners you set on this instance to the running instance.
      this.on = (event, listener) => {
        log('proxying the "%s" listener')

        runningInstance.emitter.prependListener(event, listener)

        this.subscriptions.push(() => {
          // Automatically remove the listener when the instance is disposed.
          runningInstance.emitter.removeListener(event, listener)
        })
      }

      return
    }

    log('no running instance found, setting up a new instance...')

    // Setup the interceptor.
    this.setup()

    // Store the newly applied interceptor instance globally.
    setGlobalSymbol(this.symbol, this)
  }

  /**
   * Setup the module augments and stubs necessary for this interceptor.
   * This method is not run if there's a running interceptor instance
   * to prevent instantiating an interceptor multiple times.
   */
  protected setup(): void {}

  /**
   * Listen to the interceptor's public events.
   */
  public on<Event extends keyof EventMap>(
    event: Event,
    listener: EventMap[Event]
  ): void {
    const log = this.log.extend('on')
    log('adding "%s" event listener:', event, listener.name)

    this.emitter.on(event, listener)
  }

  /**
   * Disposes of any side-effects this interceptor has introduced.
   */
  public dispose(): void {
    const log = this.log.extend('dispose')
    log('disposing the interceptor...')

    // Delete the global symbol as soon as possible,
    // indicating that the interceptor is no longer running.
    deleteGlobalSymbol(this.symbol)

    log('global symbol deleted:', getGlobalSymbol(this.symbol))

    for (const dispose of this.subscriptions) {
      dispose()
    }
    log('disposed of %d subscriptions!', this.subscriptions.length)

    this.emitter.removeAllListeners()
    log('removed all listeners!')
  }
}
