import {
  type DefaultEventMap,
  Emitter,
  type TypedEvent,
  type WithReservedEvents,
} from 'rettime'
import { Interceptor } from './interceptor'
import { type DisposableSubscription } from './disposable'

type GenericEventListener = Emitter.Listener<
  Emitter<DefaultEventMap>,
  string
>

function addEventBridge(
  interceptor: Interceptor<DefaultEventMap>,
  type: string,
  listener: GenericEventListener
): void {
  interceptor.on(type, listener)
}

function removeEventBridge(
  interceptor: Interceptor<DefaultEventMap>,
  type: string,
  listener: GenericEventListener
): void {
  interceptor.removeListener(type, listener)
}

export interface BatchInterceptorOptions<
  InterceptorList extends ReadonlyArray<Interceptor<DefaultEventMap>>,
> {
  name: string
  interceptors: InterceptorList
}

export type ExtractEventMapType<
  InterceptorList extends ReadonlyArray<Interceptor<DefaultEventMap>>,
> =
  InterceptorList extends ReadonlyArray<infer InterceptorType>
    ? InterceptorType extends Interceptor<infer EventMap>
      ? EventMap
      : never
    : never

/**
 * A batch interceptor that exposes a single interface
 * to apply and operate with multiple interceptors at once.
 */
export class BatchInterceptor<
  InterceptorList extends ReadonlyArray<Interceptor<DefaultEventMap>>,
  Events extends DefaultEventMap = ExtractEventMapType<InterceptorList>,
> extends Interceptor<Events> {
  #interceptors: InterceptorList
  #eventBridges: Map<string, DisposableSubscription>
  #forwardedEvents: Map<string, WeakSet<object>>

  constructor(options: BatchInterceptorOptions<InterceptorList>) {
    super()

    this.#interceptors = options.interceptors
    this.#eventBridges = new Map()
    this.#forwardedEvents = new Map()

    this.emitter.hooks.on(
      'newListener',
      (type) => {
        this.#ensureEventBridge(type)
      },
      {
        persist: true,
      }
    )

    this.emitter.hooks.on(
      'removeListener',
      (type) => {
        if (this.emitter.listenerCount(type) === 0) {
          this.#removeEventBridge(type)
        }
      },
      {
        persist: true,
      }
    )
  }

  protected predicate(): boolean {
    for (const interceptor of this.#interceptors) {
      if (interceptor['predicate']()) {
        /**
         * @note If at least one of the provided interceptors suits the environment,
         * treat this batch interceptor as matching. Since all the interceptors abide
         * by the same event map, it will handle the events from any that match.
         */
        return true
      }
    }

    return false
  }

  protected setup(): void {
    const interceptors = new Set(this.#interceptors)

    this.#forwardedEvents = new Map()

    this.logger.verbose(
      'applying batch %s with %d interceptors',
      this.constructor.name,
      interceptors.size
    )

    this.subscriptions.push(() => {
      this.#removeAllEventBridges()
    })

    for (const interceptor of interceptors) {
      this.logger.verbose(
        'applying "%s" interceptor...',
        interceptor.constructor.name
      )
      interceptor.apply(this)

      this.logger.verbose('adding interceptor dispose subscription')
      this.subscriptions.push(() => {
        interceptor.dispose(this)
      })
    }
  }

  #ensureEventBridge(
    type: keyof WithReservedEvents<Events> & string
  ): void {
    if (this.#eventBridges.has(type)) {
      return
    }

    if (type === '*') {
      this.#ensureWildcardEventBridge()
      return
    }

    this.#ensureTypedEventBridge(type)
  }

  #ensureTypedEventBridge(type: keyof Events & string): void {
    const interceptors = new Set(this.#interceptors)
    const batchEmitter = this.emitter as Emitter<DefaultEventMap>
    const forwardEvent: GenericEventListener = async (event) => {
      if (this.#recordForwardedEvent(event)) {
        this.logger.verbose('skipping duplicate "%s" event', event.type)
        return
      }

      this.logger.verbose('forwarding "%s" event', event.type)
      await batchEmitter.emitAsPromise(event)
    }

    for (const interceptor of interceptors) {
      addEventBridge(interceptor, type, forwardEvent)
    }

    this.#eventBridges.set(type, () => {
      for (const interceptor of interceptors) {
        removeEventBridge(interceptor, type, forwardEvent)
      }
    })
  }

  #ensureWildcardEventBridge(): void {
    const interceptors = new Set(this.#interceptors)
    const batchEmitter = this.emitter as Emitter<DefaultEventMap>
    const forwardEvent: GenericEventListener = (event: TypedEvent): void => {
      if (this.#recordForwardedEvent(event)) {
        this.logger.verbose('skipping duplicate "%s" event', event.type)
        return
      }

      this.logger.verbose('forwarding wildcard "%s" event', event.type)
      void batchEmitter.emitAsPromise(event)
    }

    for (const interceptor of interceptors) {
      addEventBridge(interceptor, '*', forwardEvent)
    }

    this.#eventBridges.set('*', () => {
      for (const interceptor of interceptors) {
        removeEventBridge(interceptor, '*', forwardEvent)
      }
    })
  }

  #recordForwardedEvent(event: TypedEvent): boolean {
    const forwardedEvents = this.#forwardedEvents.get(event.type)

    if (forwardedEvents?.has(event)) {
      return true
    }

    if (forwardedEvents) {
      forwardedEvents.add(event)
      return false
    }

    this.#forwardedEvents.set(event.type, new WeakSet([event]))
    return false
  }

  #removeEventBridge(
    type: keyof WithReservedEvents<Events> & string
  ): void {
    const disposeEventBridge = this.#eventBridges.get(type)

    if (!disposeEventBridge) {
      return
    }

    disposeEventBridge()
    this.#eventBridges.delete(type)
  }

  #removeAllEventBridges(): void {
    for (const disposeEventBridge of this.#eventBridges.values()) {
      disposeEventBridge()
    }

    this.#eventBridges.clear()
  }
}
