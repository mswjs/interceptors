import {
  type Emitter,
  type DefaultEventMap,
  TypedListenerOptions,
  WithReservedEvents,
} from 'rettime'
import { Logger } from '@open-draft/logger'
import { Interceptor } from './interceptor'

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
  static symbol: symbol

  #logger: Logger
  #interceptors: InterceptorList

  constructor(options: BatchInterceptorOptions<InterceptorList>) {
    BatchInterceptor.symbol = Symbol.for(options.name)

    super()

    this.#logger = logger.extend(options.name)
    this.#interceptors = options.interceptors
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

    for (const interceptor of this.#interceptors) {
      logger.info('applying "%s" interceptor...', interceptor.constructor.name)
      interceptor.apply()

      logger.info('adding interceptor dispose subscription')
      this.subscriptions.push(() => interceptor.dispose())
    }
  }

  public on: (typeof this.emitter)['on'] = (type, listener, options) => {
    for (const interceptor of this.#interceptors) {
      interceptor.on(type, listener, options)
    }

    return this.emitter
  }

  public once: (typeof this.emitter)['once'] = (type, listener, options) => {
    for (const interceptor of this.#interceptors) {
      interceptor.once(type, listener, options)
    }

    return this.emitter
  }

  public removeListener: (typeof this.emitter)['removeListener'] = (
    type,
    listener
  ) => {
    for (const interceptor of this.#interceptors) {
      interceptor.removeListener(type, listener)
    }
  }

  public removeAllListeners: (typeof this.emitter)['removeAllListeners'] = (
    type
  ) => {
    for (const interceptor of this.#interceptors) {
      interceptor.removeAllListeners(type)
    }
  }

  public listeners: (typeof this.emitter)['listeners'] = (type) => {
    return this.#interceptors[0].listeners(type)
  }

  public listenerCount: (typeof this.emitter)['listenerCount'] = (type) => {
    return this.#interceptors[0].listenerCount(type)
  }
}
