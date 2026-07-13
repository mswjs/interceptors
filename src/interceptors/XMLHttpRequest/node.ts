import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { Interceptor } from '#/src/interceptor'
import { forwardHttpEvents } from '#/src/interceptors/http/forward-events'
import { NodeHttpRequestSource } from '#/src/interceptors/http/source'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { FetchRequest } from '#/src/utils/fetchUtils'
import { HttpRequestEventMap } from '#/src/events/http'
import { createLogger } from '#/src/utils/logger'

const log = createLogger('xhr')

export class XMLHttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('xhr-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('XMLHttpRequest')
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
          return initiator instanceof XMLHttpRequest
        },
      })
    )

    log('patching global "XMLHttpRequest"...')

    const prepareRequest = this.#transformRequest.bind(this)

    this.subscriptions.push(
      patchesRegistry.applyPatch(
        globalThis,
        'XMLHttpRequest',
        (realXMLHttpRequest) => {
          return new Proxy(realXMLHttpRequest, {
            construct(target, args, newTarget) {
              const xmlHttpRequest = Reflect.construct(target, args, newTarget)

              /**
               * @note Use `.enterWith()` here because XHR in JSDOM is implemented
               * via `http`/`https`. This makes the initiator cascading work properly.
               */
              requestContext.enterWith({
                initiator: xmlHttpRequest,
                prepareRequest: (request) => {
                  return prepareRequest(request, xmlHttpRequest)
                },
              })

              /**
               * @todo Do we need to exit the async context at some point?
               */

              return xmlHttpRequest
            },
          })
        }
      )
    )

    log('global "XMLHttpRequest" patched!')
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
