import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { forwardHttpEvents } from '#/src/interceptors/http/forward-events'
import { NodeHttpRequestSource } from '#/src/interceptors/http/source'
import { HttpRequestEventMap } from '#/src/events/http'
import { Interceptor } from '../../interceptor'

/**
 * Interceptor for `fetch` requests in Node.js.
 * @note This interceptor only affects requests performed via
 * the global `fetch` function. To intercept fetch requests performed
 * by other means (e.g. direct `request()` from Undici) use the
 * `HttpRequestInterceptor` instead.
 */
export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
    const requestSource = Interceptor.singleton(NodeHttpRequestSource)
    requestSource.apply(this)

    this.subscriptions.push(() => {
      requestSource.dispose(this)
    })

    this.subscriptions.push(
      forwardHttpEvents({
        source: requestSource,
        emitter: this.emitter,
        predicate: (initiator) => {
          return initiator instanceof Request
        },
        responsePredicate: (event) => {
          /**
           * @note Fetch clients never observe informational responses (1xx).
           * Undici treats them as a network error, failing the request,
           * so do not forward their "response" events to fetch consumers.
           */
          return event.response.status >= 200
        },
      })
    )

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

          requestContext.enterWith({
            initiator: request,
            logger: this.logger,
          })

          return realFetch(request)
        }
      })
    )
  }
}
