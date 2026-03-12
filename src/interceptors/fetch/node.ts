import { Interceptor } from '#/src/Interceptor'
import type { HttpRequestEventMap } from '#/src/events/http'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { applyPatch } from '#/src/utils/apply-patch'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { propagateHttpEvents } from '#/src/utils/interceptor-utils'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  constructor() {
    super(FetchInterceptor.symbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
    const httpInterceptor = new HttpRequestInterceptor()

    httpInterceptor.apply()
    this.subscriptions.push(() => httpInterceptor.dispose())

    const { controller } = propagateHttpEvents(
      httpInterceptor['emitter'],
      this.emitter,
      (event) => {
        return event.initiator instanceof Request
      }
    )
    this.subscriptions.push(() => controller.abort())

    this.subscriptions.push(
      applyPatch(globalThis, 'fetch', (realFetch) => {
        return (input, init) => {
          /**
           * @note Resolve potentially relative request URL against the present `location`.
           * This is mainly for native `fetch` in browser-like environments.
           * @see https://github.com/mswjs/msw/issues/1625
           */
          const resolvedInput =
            typeof input === 'string' &&
            typeof location !== 'undefined' &&
            !canParseUrl(input)
              ? new URL(input, location.href)
              : input

          const request = new Request(resolvedInput, init)

          requestContext.enterWith({ initiator: request })
          return realFetch(input, init)
        }
      })
    )
  }
}
