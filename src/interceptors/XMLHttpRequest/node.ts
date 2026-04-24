import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { Interceptor } from '#/src/Interceptor'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { globalsRegistry } from '#/src/utils/globalsRegistry'
import { FetchRequest } from '#/src/utils/fetchUtils'
import { HttpRequestEventMap } from '#/src/events/http'
import { proxyEventListeners } from '#/src/utils/interceptor-utils'

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('xhr-interceptor')

  #httpInterceptor: HttpRequestInterceptor

  constructor() {
    super(XMLHttpRequestInterceptor.symbol)

    this.#httpInterceptor = new HttpRequestInterceptor()

    this.subscriptions.push(
      proxyEventListeners({
        from: this.emitter,
        to: () => this.#httpInterceptor['emitter'],
        filter: (event) => {
          if (event.initiator instanceof XMLHttpRequest) {
            event.request = this.#transformRequest(
              event.request,
              event.initiator
            )
            return true
          }

          return false
        },
      })
    )
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup(): void {
    this.#httpInterceptor.apply()
    this.subscriptions.push(() => this.#httpInterceptor.dispose())

    this.logger.info('patching global "XMLHttpRequest"...')

    this.subscriptions.push(
      globalsRegistry.replaceGlobal(globalThis, 'XMLHttpRequest', (realXMLHttpRequest) => {
        return new Proxy(realXMLHttpRequest, {
          construct(target, args, newTarget) {
            const xmlHttpRequest = Reflect.construct(target, args, newTarget)

            /**
             * @note Use `.enterWith()` here because XHR in JSDOM is implemented
             * via `http`/`https`. This makes the initiator cascading work properly.
             */
            requestContext.enterWith({ initiator: xmlHttpRequest })

            /**
             * @todo Do we need to exit the async context at some point?
             */

            return xmlHttpRequest
          },
        })
      })
    )

    this.logger.info('global "XMLHttpRequest" patched!')
  }

  #transformRequest(request: Request, initiator: XMLHttpRequest): Request {
    const expectedCredentials = initiator.withCredentials
      ? 'include'
      : 'same-origin'

    if (request.credentials === expectedCredentials) {
      return request
    }

    return new FetchRequest(request.url, {
      ...request,
      method: request.method,
      headers: request.headers,
      credentials: expectedCredentials,
      body: request.body,
    })
  }
}
