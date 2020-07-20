import { RequestMiddleware, ModuleOverride } from './glossary'
import { overrideModules } from './overrideModules'

const debug = require('debug')('RequestInterceptor')

export class RequestInterceptor {
  private overrides: ReturnType<ModuleOverride>[]
  private middleware: RequestMiddleware[]

  constructor() {
    this.middleware = []
    debug('created new RequestInterceptor')

    this.overrides = overrideModules.map((override) =>
      override(this.applyMiddleware)
    )
  }

  /**
   * Restores original instances of patched modules.
   */
  public restore() {
    debug('restore')
    this.overrides.forEach((restore) => restore())
  }

  /**
   * Applies given middleware to any intercepted request.
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
}
