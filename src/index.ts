import { RequestMiddleware, ModuleOverride } from './glossary'
import { overrideHttpModule } from './http/override'
import { overrideXhrModule } from './XMLHttpRequest/override'

export class RequestInterceptor {
  private overrides: ReturnType<ModuleOverride>[]
  private middleware: RequestMiddleware[]

  constructor() {
    this.middleware = []

    this.overrides = [
      overrideHttpModule(this.applyMiddleware),
      overrideXhrModule(this.applyMiddleware),
    ]
  }

  /**
   * Restores original HTTP/HTTPS/XHR instances.
   */
  public restore() {
    this.overrides.forEach((restore) => restore())
  }

  /**
   * Applies given middleware to any intercepted request.
   */
  public use(middleware: RequestMiddleware) {
    this.middleware.push(middleware)
  }

  private applyMiddleware: RequestMiddleware = async (req, ref) => {
    for (let middleware of this.middleware) {
      const res = await middleware(req, ref)

      if (res) {
        return res
      }
    }
  }
}
