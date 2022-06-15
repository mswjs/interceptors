import { EventMapType } from 'strict-event-emitter'
import { ExtractEventNames, Interceptor } from './Interceptor'

export interface BatchInterceptorOptions<
  InterceptorList extends Interceptor<any>[]
> {
  name: string
  interceptors: InterceptorList
}

export type ExtractEventMapType<InterceptorList extends Interceptor<any>[]> =
  InterceptorList extends Array<infer InterceptorType>
    ? InterceptorType extends Interceptor<infer EventMap>
      ? EventMap
      : never
    : never

/**
 * A batch interceptor that exposes a single interface
 * to apply and operate with multiple interceptors at once.
 */
export class BatchInterceptor<
  InterceptorList extends Interceptor<any>[],
  EventMap extends EventMapType = ExtractEventMapType<InterceptorList>
> extends Interceptor<EventMap> {
  static symbol: Symbol

  private interceptors: InterceptorList

  constructor(options: BatchInterceptorOptions<InterceptorList>) {
    BatchInterceptor.symbol = Symbol(options.name)
    super(BatchInterceptor.symbol)
    this.interceptors = options.interceptors

    /**
     * Ensure that child interceptors have no event listeners
     * when the batch interceptor is constructed. The listeners may
     * persists between Fast Refresh in modern apps, causing
     * the same intercepted request to be handled multiple times.
     * @see https://github.com/mswjs/msw/issues/1271
     */
    for (const interceptor of this.interceptors) {
      interceptor['emitter'].pruneListeners()
    }
  }

  protected setup() {
    const log = this.log.extend('setup')

    for (const interceptor of this.interceptors) {
      log('applying "%s" interceptor...', interceptor.constructor.name)
      interceptor.apply()

      log('adding interceptor dispose subscription')
      this.subscriptions.push(() => interceptor.dispose())
    }
  }

  public on<Event extends ExtractEventNames<EventMap>>(
    event: Event,
    listener: EventMap[Event]
  ) {
    // Instead of adding a listener to the batch interceptor,
    // propagate the listener to each of the individual interceptors.
    this.interceptors.forEach((interceptor) => {
      interceptor.on(event, listener)
    })
  }
}
