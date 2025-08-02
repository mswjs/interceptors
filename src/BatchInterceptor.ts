import type { Emitter, DefaultEventMap } from 'rettime'
import { Interceptor } from './Interceptor'

export interface BatchInterceptorOptions<
  Interceptors extends ReadonlyArray<Interceptor<any>>
> {
  name: string
  interceptors: Interceptors
}

type InferEventMap<InterceptorType extends Interceptor<any>> =
  InterceptorType extends Interceptor<infer EventMap> ? EventMap : never

type MergeEventMaps<InterceptorsList extends ReadonlyArray<Interceptor<any>>> =
  UnionToIntersection<InferEventMap<InterceptorsList[number]>>

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer T extends DefaultEventMap
) => void
  ? T
  : never

/**
 * A batch interceptor that exposes a single interface
 * to apply and operate with multiple interceptors at once.
 */
export class BatchInterceptor<
  Interceptors extends ReadonlyArray<Interceptor<any>>,
  EventMap extends DefaultEventMap = MergeEventMaps<Interceptors>
> extends Interceptor<EventMap> {
  static symbol: symbol

  #interceptors: NoInfer<Interceptors>

  constructor(options: BatchInterceptorOptions<Interceptors>) {
    BatchInterceptor.symbol = Symbol(options.name)
    super(BatchInterceptor.symbol)
    this.#interceptors = options.interceptors
  }

  protected setup() {
    const logger = this.logger.extend('setup')

    logger.info('applying all %d interceptors...', this.#interceptors.length)

    for (const interceptor of this.#interceptors) {
      logger.info('applying "%s" interceptor...', interceptor.constructor.name)
      interceptor.apply()

      logger.info('adding interceptor dispose subscription')
      this.subscriptions.push(() => interceptor.dispose())
    }
  }

  public on<EventType extends keyof EventMap & string>(
    type: EventType,
    listener: Emitter.ListenerType<typeof this.emitter, EventType>
  ): this {
    // Instead of adding a listener to the batch interceptor,
    // propagate the listener to each of the individual interceptors.
    for (const interceptor of this.#interceptors) {
      interceptor.on(type, listener)
    }

    return this
  }

  public once<EventType extends keyof EventMap & string>(
    type: EventType,
    listener: Emitter.ListenerType<typeof this.emitter, EventType>
  ): this {
    for (const interceptor of this.#interceptors) {
      interceptor.once(type, listener)
    }

    return this
  }

  public off<EventType extends keyof EventMap & string>(
    type: EventType,
    listener: Emitter.ListenerType<typeof this.emitter, EventType>
  ): this {
    for (const interceptor of this.#interceptors) {
      interceptor.off(type, listener)
    }

    return this
  }

  public removeAllListeners<EventType extends keyof EventMap & string>(
    type?: EventType | undefined
  ): this {
    for (const interceptor of this.#interceptors) {
      interceptor.removeAllListeners(type)
    }

    return this
  }
}
