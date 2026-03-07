import { Interceptor } from '#/src/Interceptor'
import { HttpRequestEventMap } from '#/src/glossary'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { applyPatch } from '#/src/utils/apply-patch'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { emitAsync } from '#/src/utils/emitAsync'

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

    httpInterceptor
      .on('request', async (args) => {
        if (args.initiator instanceof Request) {
          await emitAsync(this.emitter, 'request', args)
        }
      })
      .on('response', async (args) => {
        if (args.initiator instanceof Request) {
          await emitAsync(this.emitter, 'response', args)
        }
      })

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
