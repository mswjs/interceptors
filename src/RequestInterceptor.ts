import { RequestMiddleware, Interceptor } from './glossary'

const debug = require('debug')('RequestInterceptor')

export class RequestInterceptor {
  private interceptors: ReturnType<Interceptor>[]
  private middleware: RequestMiddleware[]

  constructor(interceptors: Interceptor[]) {
    this.middleware = []
    debug('created new RequestInterceptor', { interceptors })

    this.interceptors = interceptors.map((interceptor) => {
      return interceptor(this.applyMiddleware)
    })
  }

  /**
   * Applies given request middleware to any intercepted request.
   */
  public use(middleware: RequestMiddleware) {
    debug('use', middleware)
    this.middleware.push(middleware)
  }

  private applyMiddleware: RequestMiddleware = async (req, ref) => {
    debug('applying middleware...', req)

    for (let middleware of this.middleware) {
      const res = await middleware(req, ref)

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
    this.interceptors.forEach((restore) => restore())
  }
}
