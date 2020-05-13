import {
  RequestMiddleware,
  ModuleOverride,
  InterceptedRequest,
  MockedResponse,
} from './glossary'
import { overrideHttpModule } from './http/override'
import { overrideXhrModule } from './XMLHttpRequest/override'

const debug = require('debug')('root')

export class RequestInterceptor {
  private overrides: ReturnType<ModuleOverride>[]
  private middleware: RequestMiddleware[]

  constructor() {
    this.middleware = []

    debug('created new instance')

    this.overrides = [
      overrideHttpModule(this.applyMiddleware),
      overrideXhrModule(this.applyMiddleware),
    ]
  }

  /**
   * Restores original HTTP/HTTPS/XHR instances.
   */
  public restore() {
    debug('restore')
    this.overrides.forEach((restore) => restore())
  }

  /**
   * Applies given middleware to any intercepted request.
   */
  public use(middleware: RequestMiddleware) {
    debug('use')
    this.middleware.push(middleware)
  }

  private applyMiddleware: RequestMiddleware = async (req, ref) => {
    debug('applyMiddleware', req)

    for (let middleware of this.middleware) {
      const res = await middleware(req, ref)

      if (res) {
        return res
      }
    }
  }
}

export { InterceptedRequest, MockedResponse }
