import { RequestMiddleware, ModuleOverride } from './glossary'
import { overrideHttpModule } from './http/override'
import { overrideXhrModule } from './XMLHttpRequest/override'

export class RequestInterceptor {
  private overrides: ReturnType<ModuleOverride>[]
  private handlers: RequestMiddleware[]

  constructor() {
    this.handlers = []

    this.overrides = [
      overrideHttpModule(this.applyMiddleware),
      overrideXhrModule(this.applyMiddleware),
    ]
  }

  /**
   * Removes all the stubs and restores original instances.
   */
  public restore() {
    this.overrides.forEach((restore) => restore())
  }

  /**
   * Applies given request interception middleware to any outgoing request.
   */
  public use(handler: RequestMiddleware) {
    this.handlers.push(handler)
  }

  private applyMiddleware: RequestMiddleware = async (req, ref) => {
    for (let handler of this.handlers) {
      const res = await handler(req, ref)

      if (res) {
        return res
      }
    }
  }
}
