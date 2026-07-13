import { type DefaultEventMap } from 'rettime'
import { Logger } from '@open-draft/logger'
import { Interceptor } from './interceptor'
import { type DisposableSubscription } from './disposable'

interface BatchListenerSubscription {
  listener: object
  dispose: DisposableSubscription
}

export interface BatchInterceptorOptions<
  InterceptorList extends ReadonlyArray<Interceptor<any>>,
> {
  name: string
  interceptors: InterceptorList
}

export type ExtractEventMapType<
  InterceptorList extends ReadonlyArray<Interceptor<any>>,
> =
  InterceptorList extends ReadonlyArray<infer InterceptorType>
    ? InterceptorType extends Interceptor<infer EventMap>
      ? EventMap
      : never
    : never

const logger = new Logger('BatchInterceptor')

/**
 * A batch interceptor that exposes a single interface
 * to apply and operate with multiple interceptors at once.
 */
export class BatchInterceptor<
  InterceptorList extends ReadonlyArray<Interceptor<any>>,
  Events extends DefaultEventMap = ExtractEventMapType<InterceptorList>,
> extends Interceptor<Events> {
  #logger: Logger
  #interceptors: InterceptorList
  #listenerSubscriptions: Map<string, Array<BatchListenerSubscription>>

  constructor(options: BatchInterceptorOptions<InterceptorList>) {
    super()

    this.#logger = logger.extend(options.name)
    this.#interceptors = options.interceptors
    this.#listenerSubscriptions = new Map()
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

  protected setup() {
    const logger = this.#logger.extend('setup')

    logger.info('applying all %d interceptors...', this.#interceptors.length)

    this.subscriptions.push(() => {
      this.#removeAllListeners()
    })

    for (const interceptor of this.#interceptors) {
      logger.info('applying "%s" interceptor...', interceptor.constructor.name)
      interceptor.apply(this)

      logger.info('adding interceptor dispose subscription')
      this.subscriptions.push(() => {
        interceptor.dispose(this)
      })
    }
  }

  public on: (typeof this.emitter)['on'] = (type, listener, options) => {
    for (const interceptor of this.#interceptors) {
      interceptor.on(type, listener, options)
    }

    this.#addListenerSubscription(type, listener, () => {
      for (const interceptor of this.#interceptors) {
        interceptor.removeListener(type, listener)
      }
    })

    return this.emitter
  }

  public once: (typeof this.emitter)['once'] = (type, listener, options) => {
    for (const interceptor of this.#interceptors) {
      interceptor.once(type, listener, options)
    }

    this.#addListenerSubscription(type, listener, () => {
      for (const interceptor of this.#interceptors) {
        interceptor.removeListener(type, listener)
      }
    })

    return this.emitter
  }

  public removeListener: (typeof this.emitter)['removeListener'] = (
    type,
    listener
  ) => {
    this.#removeListener(type, listener)
  }

  public removeAllListeners: (typeof this.emitter)['removeAllListeners'] = (
    type
  ) => {
    this.#removeAllListeners(type)
  }

  #addListenerSubscription(
    type: string,
    listener: object,
    disposeListener: () => void
  ): void {
    const listenerSubscriptions = this.#listenerSubscriptions.get(type)
    const listenerSubscription: BatchListenerSubscription = {
      listener,
      dispose: disposeListener,
    }

    if (listenerSubscriptions) {
      listenerSubscriptions.push(listenerSubscription)
      return
    }

    this.#listenerSubscriptions.set(type, [listenerSubscription])
  }

  #removeListener(type: string, listener: object): void {
    const listenerSubscriptions = this.#listenerSubscriptions.get(type)

    if (!listenerSubscriptions) {
      return
    }

    for (
      let index = listenerSubscriptions.length - 1;
      index >= 0;
      index--
    ) {
      const listenerSubscription = listenerSubscriptions[index]

      if (listenerSubscription.listener !== listener) {
        continue
      }

      listenerSubscription.dispose()
      listenerSubscriptions.splice(index, 1)

      if (listenerSubscriptions.length === 0) {
        this.#listenerSubscriptions.delete(type)
      }

      return
    }
  }

  #removeAllListeners(type?: string): void {
    if (type != null) {
      const listenerSubscriptions = this.#listenerSubscriptions.get(type)

      if (!listenerSubscriptions) {
        return
      }

      for (const listenerSubscription of listenerSubscriptions) {
        listenerSubscription.dispose()
      }

      this.#listenerSubscriptions.delete(type)
      return
    }

    for (const listenerType of this.#listenerSubscriptions.keys()) {
      this.#removeAllListeners(listenerType)
    }
  }

  public listeners: (typeof this.emitter)['listeners'] = (type) => {
    return this.#interceptors[0].listeners(type)
  }

  public listenerCount: (typeof this.emitter)['listenerCount'] = (type) => {
    return this.#interceptors[0].listenerCount(type)
  }
}
