import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { Interceptor } from '#/src/interceptor'
import { forwardHttpEvents } from '#/src/interceptors/http/forward-events'
import { NodeHttpRequestSource } from '#/src/interceptors/http/source'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { FetchRequest } from '#/src/utils/fetchUtils'
import { HttpRequestEventMap } from '#/src/events/http'
import { createLogger } from '#/src/utils/logger'

const logger = createLogger('xhr')

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

    logger.verbose('patching global "XMLHttpRequest"...')

    const prepareRequest = this.#transformRequest.bind(this)
    const requestLogger = this.logger

    this.subscriptions.push(
      patchesRegistry.applyPatch(
        globalThis,
        'XMLHttpRequest',
        (realXMLHttpRequest) => {
          return new Proxy(realXMLHttpRequest, {
            construct(target, args, newTarget) {
              const xmlHttpRequest = Reflect.construct(target, args, newTarget)

              /**
               * @note Scope the request context to the `send()` call.
               * XHR in JSDOM is implemented via `http`/`https`, and the
               * underlying `http.ClientRequest` is created within `send()`,
               * so the initiator cascading keeps working. Binding the
               * context to the caller's scope instead (e.g. `enterWith`)
               * would attribute unrelated requests performed after this
               * XMLHttpRequest to it.
               */
              const realSend = xmlHttpRequest.send
              xmlHttpRequest.send = (
                ...sendArgs: Parameters<XMLHttpRequest['send']>
              ) => {
                return requestContext.run(
                  {
                    initiator: xmlHttpRequest,
                    logger: requestLogger,
                    transformRequest: (request) => {
                      return prepareRequest(request, xmlHttpRequest)
                    },
                  },
                  () => realSend.apply(xmlHttpRequest, sendArgs)
                )
              }

              return xmlHttpRequest
            },
          })
        }
      )
    )

    logger.verbose('global "XMLHttpRequest" patched!')
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
      signal: request.signal,
    })
  }
}
