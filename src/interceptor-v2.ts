import { Emitter } from 'rettime'
import { InterceptorEventMap } from './Interceptor'
import { Disposable } from './disposable'

export enum InterceptorReadyState {
  INACTIVE = 'INACTIVE',
  ACTIVE = 'ACTIVE',
  DISPOSED = 'DISPOSED',
}

const interceptorsRegistry = new Map<symbol, Interceptor<any>>()

export abstract class Interceptor<
  Events extends InterceptorEventMap,
> extends Disposable {
  declare ['constructor']: typeof Interceptor

  protected emitter: Emitter<Events>

  public readyState: InterceptorReadyState
  public on: Emitter<Events>['on']
  public once: Emitter<Events>['once']
  public removeListener: Emitter<Events>['removeListener']
  public removeAllListeners: Emitter<Events>['removeAllListeners']

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
    this.on = this.emitter.on.bind(this.emitter)
    this.once = this.emitter.once.bind(this.emitter)
    this.removeListener = this.emitter.removeListener.bind(this.emitter)
    this.removeAllListeners = this.emitter.removeAllListeners.bind(this.emitter)
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
}
