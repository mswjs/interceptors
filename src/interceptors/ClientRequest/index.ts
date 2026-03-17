import http from 'node:http'
import https from 'node:https'
import { runInRequestContext } from '#/src/request-context'
import { applyPatch } from '#/src/utils/apply-patch'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { Interceptor } from '#/src/Interceptor'
import { HttpRequestEventMap } from '#/src/events/http'
import { proxyEventListeners } from '#/src/utils/interceptor-utils'

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('client-request-interceptor')

  #httpInterceptor: HttpRequestInterceptor

  constructor() {
    super(ClientRequestInterceptor.symbol)

    this.#httpInterceptor = new HttpRequestInterceptor()
    this.subscriptions.push(
      proxyEventListeners({
        from: this.emitter,
        to: () => this.#httpInterceptor['emitter'],
        filter: (event) => {
          return event.initiator instanceof http.ClientRequest
        },
      })
    )
  }

  protected setup(): void {
    this.#httpInterceptor.apply()
    this.subscriptions.push(() => this.#httpInterceptor.dispose())

    this.subscriptions.push(
      applyPatch(http, 'ClientRequest', (ClientRequest) => {
        return new Proxy(ClientRequest, {
          construct(target, args, newTarget) {
            return runInRequestContext(() => {
              return Reflect.construct(target, args, newTarget)
            })
          },
        })
      }),
      applyPatch(http, 'get', (httpGet) => {
        return function mockHttpGet(...args) {
          return runInRequestContext(() => {
            return httpGet(...(args as [any, any]))
          })
        }
      }),
      applyPatch(http, 'request', (httpRequest) => {
        return function mockHttpRequest(...args) {
          return runInRequestContext(() => {
            return httpRequest(...(args as [any, any]))
          })
        }
      }),
      applyPatch(https, 'get', (httpsGet) => {
        return function mockHttpsGet(...args) {
          return runInRequestContext(() => {
            return httpsGet(...(args as [any, any]))
          })
        }
      }),
      applyPatch(https, 'request', (httpsRequest) => {
        return function mockHttpsGet(...args) {
          return runInRequestContext(() => {
            return httpsRequest(...(args as [any, any]))
          })
        }
      })
    )
  }
}
