import { Emitter, type DefaultEventMap } from 'rettime'
import { Disposable } from './disposable'

export enum InterceptorReadyState {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  DISPOSED = 'DISPOSED',
}

declare global {
  var __MSW_INTERCEPTORS_REGISTRY: Map<symbol, Interceptor<any>> | undefined
}

const interceptorsRegistry = (globalThis.__MSW_INTERCEPTORS_REGISTRY ??=
  new Map<symbol, Interceptor<any>>())

export abstract class Interceptor<
  Events extends DefaultEventMap,
> extends Disposable {
  declare ['constructor']: typeof Interceptor

  protected emitter: Emitter<Events>

  public readyState: InterceptorReadyState

  static readonly symbol: symbol

  #leaseCount: number

  static singleton<T extends Interceptor<any>>(
    InterceptorClass: (new () => T) & { symbol: symbol }
  ): T {
    const symbol = InterceptorClass.symbol
    const existing = interceptorsRegistry.get(symbol)

    if (existing instanceof InterceptorClass) {
      return existing
    }

    const newInstance = new InterceptorClass()
    interceptorsRegistry.set(symbol, newInstance)
    return newInstance
  }

  constructor() {
    super()

    this.#leaseCount = 0
    this.readyState = InterceptorReadyState.INACTIVE
    this.emitter = new Emitter()
  }

  protected abstract predicate(): boolean
  protected abstract setup(): void

  public apply(): void {
    if (this.readyState === InterceptorReadyState.DISPOSED) {
      return
    }

    if (!this.predicate()) {
      return
    }

    this.#leaseCount++

    if (this.#leaseCount === 1) {
      try {
        this.setup()
        this.readyState = InterceptorReadyState.ACTIVE
      } catch (error) {
        this.dispose()
        throw error
      }
    }
  }

  public dispose(): void {
    if (this.readyState === InterceptorReadyState.DISPOSED) {
      return
    }

    if (this.#leaseCount === 0) {
      return
    }

    this.#leaseCount--

    if (this.#leaseCount === 0) {
      super.dispose()
      this.emitter.removeAllListeners()
      this.readyState = InterceptorReadyState.DISPOSED
    }
  }

  public on: Emitter<Events>['on'] = (type, listener, options) => {
    return this.emitter.on(type, listener, options)
  }

  public once: Emitter<Events>['once'] = (type, listener, options) => {
    return this.emitter.once(type, listener, options)
  }

  public listeners: Emitter<Events>['listeners'] = (type) => {
    return this.emitter.listeners(type)
  }

  public listenerCount: Emitter<Events>['listenerCount'] = (type) => {
    return this.emitter.listenerCount(type)
  }

  public removeListener: Emitter<Events>['removeListener'] = (
    type,
    listener
  ) => {
    return this.emitter.removeListener(type, listener)
  }

  public removeAllListeners: Emitter<Events>['removeAllListeners'] = (type) => {
    return this.emitter.removeAllListeners(type)
  }
}
