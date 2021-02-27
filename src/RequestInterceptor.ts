import { StrictEventEmitter } from 'strict-event-emitter'
import {
  Interceptor,
  RequestInterceptorEventsMap,
  RequestMiddleware,
} from './glossary'

const debug = require('debug')('RequestInterceptor')

interface RequestInterceptorOptions {
  modules: Interceptor[]
}

export class RequestInterceptor {
  private interceptors: ReturnType<Interceptor>[]
  private emitter: StrictEventEmitter<RequestInterceptorEventsMap>
  private middleware: RequestMiddleware[]

  constructor(options: RequestInterceptorOptions) {
    this.emitter = new StrictEventEmitter<RequestInterceptorEventsMap>()
    this.middleware = []
    debug('created new RequestInterceptor', options.modules)

    this.interceptors = options.modules.map((interceptor) => {
      return interceptor(this.applyMiddleware, {
        emitter: this.emitter,
      })
    })
  }

  /**
   * Applies given request middleware to any intercepted request.
   */
  public use(requestMiddleware: RequestMiddleware) {
    debug('use', requestMiddleware)
    this.middleware.push(requestMiddleware)
  }

  public on<K extends keyof RequestInterceptorEventsMap>(
    eventType: K,
    listener: RequestInterceptorEventsMap[K]
  ) {
    this.emitter.addListener(eventType, listener)
  }

  private applyMiddleware: RequestMiddleware = async (req, ref) => {
    debug('applying middleware...', req)

    for (let requestMiddleware of this.middleware) {
      const res = await requestMiddleware(req, ref)

      if (res) {
        return res
      }
    }
  }

  /**
   * Restores original instances of patched modules.
   */
  public restore() {
    debug('restore')
    this.emitter.removeAllListeners()
    this.interceptors.forEach((restore) => restore())
  }
}
