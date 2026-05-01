import {
  Emitter,
  type DefaultEventMap,
  type TypedListenerOptions,
} from 'rettime'
import { Interceptor } from './interceptor'
import { Logger } from '@open-draft/logger'

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

    for (const interceptor of options.interceptors) {
      interceptor.on('*', async (event) => {
        await this.emitter.emitAsPromise(event)
      })
    }
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

  // public on<EventType extends Emitter.AllEventTypes<typeof this.emitter>>(
  //   type: EventType,
  //   listener: Emitter.Listener<typeof this.emitter, EventType>,
  //   options?: TypedListenerOptions
  // ): this {
  //   // Instead of adding a listener to the batch interceptor,
  //   // propagate the listener to each of the individual interceptors.
  //   for (const interceptor of this.interceptors) {
  //     interceptor.on(type, listener, options)
  //   }

  //   return this
  // }

  // public once<EventType extends Emitter.AllEventTypes<typeof this.emitter>>(
  //   event: EventType,
  //   listener: Emitter.Listener<typeof this.emitter, EventType>,
  //   options?: Omit<TypedListenerOptions, 'once'>
  // ): this {
  //   for (const interceptor of this.interceptors) {
  //     interceptor.once(event, listener, options)
  //   }

  //   return this
  // }

  // public removeListener<
  //   EventType extends Emitter.AllEventTypes<typeof this.emitter>,
  // >(
  //   event: EventType,
  //   listener: Emitter.Listener<typeof this.emitter, EventType>
  // ): this {
  //   for (const interceptor of this.interceptors) {
  //     interceptor.removeListener(event, listener)
  //   }

  //   return this
  // }

  // public removeAllListeners<
  //   EventType extends Emitter.AllEventTypes<typeof this.emitter>,
  // >(event?: EventType | undefined): this {
  //   for (const interceptors of this.interceptors) {
  //     interceptors.removeAllListeners(event)
  //   }

  //   return this
  // }
}
