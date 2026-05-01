import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { HttpRequestEventMap } from '#/src/events/http'
import { Interceptor } from '../../interceptor'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
    const httpInterceptor = Interceptor.singleton(HttpRequestInterceptor)
    httpInterceptor.apply()
    this.subscriptions.push(() => httpInterceptor.dispose())

    const controller = new AbortController()
    this.subscriptions.push(() => controller.abort())

    httpInterceptor.on(
      'request',
      (event) => {
        if (event.initiator instanceof Request) {
          this.emitter.emit(event)
        }
      },
      {
        signal: controller.signal,
      }
    )
    httpInterceptor.on(
      'response',
      (event) => {
        if (event.initiator instanceof Request) {
          this.emitter.emit(event)
        }
      },
      {
        signal: controller.signal,
      }
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

          requestContext.enterWith({ initiator: request })
          return realFetch(input, init)
        }
      })
    )
  }
}
