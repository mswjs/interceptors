import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { applyPatch } from '#/src/utils/apply-patch'
import { Interceptor } from '#/src/Interceptor'
import { HttpRequestEventMap } from '../../events/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { FetchRequest } from '#/src/utils/fetchUtils'
import { propagateHttpEvents } from '#/src/utils/interceptor-utils'

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('xhr-interceptor')

  constructor() {
    super(XMLHttpRequestInterceptor.symbol)
  }

  protected checkEnvironment() {
    return hasConfigurableGlobal('XMLHttpRequest')
  }

  protected setup(): void {
    const httpInterceptor = new HttpRequestInterceptor()

    httpInterceptor.apply()
    this.subscriptions.push(() => httpInterceptor.dispose())

    this.emitter.hooks.on('beforeEmit', (event) => {
      event.modify = true
    })

    const { controller } = propagateHttpEvents(
      httpInterceptor['emitter'],
      this.emitter,
      (event) => {
        if (event.initiator instanceof XMLHttpRequest) {
          event.request = this.#transformRequest(event.request, event.initiator)
          return true
        }

        return false
      }
    )
    this.subscriptions.push(() => controller.abort())

    this.logger.info('patching global "XMLHttpRequest"...')

    this.subscriptions.push(
      applyPatch(globalThis, 'XMLHttpRequest', () => {
        return new Proxy(globalThis.XMLHttpRequest, {
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
    return new FetchRequest(request.url, {
      ...request,
      method: request.method,
      headers: request.headers,
      credentials: initiator.withCredentials ? 'include' : 'same-origin',
      body: request.body,
    })
  }
}
