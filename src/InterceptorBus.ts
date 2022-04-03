import { Interceptor } from './Interceptor'

export interface InterceptorBusOptions<
  InterceptorList extends Interceptor<any>[]
> {
  interceptors: InterceptorList
}

export class InterceptorBus<
  InterceptorList extends Interceptor<any>[],
  EventMap extends Record<string, any> = InterceptorList extends Interceptor<
    infer EventMap
  >[]
    ? EventMap
    : never
> extends Interceptor<EventMap> {
  static symbol = Symbol('interceptor-bus')

  private interceptors: InterceptorList

  constructor(options: InterceptorBusOptions<InterceptorList>) {
    super(InterceptorBus.symbol)
    this.interceptors = options.interceptors
  }

  setup() {
    const log = this.log.extend('setup')

    log('applying all %d interceptors...', this.interceptors.length)

    for (const interceptor of this.interceptors) {
      log('applying "%s" interceptor...', interceptor.constructor.name)
      interceptor.apply()

      log('adding interceptor dispose subscription')
      this.subscriptions.push(() => interceptor.dispose())
    }
  }

  public on<Event extends keyof EventMap>(
    event: Event,
    listener: EventMap[Event]
  ) {
    this.interceptors.forEach((interceptor) => {
      interceptor.on(event, listener)
    })
  }
}
