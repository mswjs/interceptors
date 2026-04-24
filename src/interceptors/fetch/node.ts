import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { Interceptor } from '#/src/Interceptor'
import { HttpRequestEventMap } from '#/src/events/http'
import { proxyEventListeners } from '#/src/utils/interceptor-utils'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  #httpInterceptor: HttpRequestInterceptor

  constructor() {
    super(FetchInterceptor.symbol)

    this.#httpInterceptor = new HttpRequestInterceptor()

    this.subscriptions.push(
      proxyEventListeners({
        from: this.emitter,
        to: () => this.#httpInterceptor['emitter'],
        filter: (event) => {
          return event.initiator instanceof Request
        },
      })
    )
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
    this.#httpInterceptor.apply()
    this.subscriptions.push(() => this.#httpInterceptor.dispose())

    this.subscriptions.push(
      patchesRegistry.applyPatch(globalThis, 'fetch', (realFetch) => {
        return (input, init) => {
          /**
           * Resolve potentially relative request URL against the present `location`.
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
