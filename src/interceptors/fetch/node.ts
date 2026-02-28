import { hasConfigurableGlobal } from '../../utils/hasConfigurableGlobal'
import { HttpRequestEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { canParseUrl } from '../../utils/canParseUrl'
import { requestContext } from '../../request-context'
import { applyPatch } from '../../utils/apply-patch'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('fetch')

  constructor() {
    super(FetchInterceptor.symbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
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
