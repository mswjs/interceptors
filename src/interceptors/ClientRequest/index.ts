import http from 'node:http'
import https from 'node:https'
import { runInRequestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { Interceptor } from '../../interceptor'
import { HttpRequestEventMap } from '#/src/events/http'

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('client-request-interceptor')

  protected predicate(): boolean {
    return true
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
        if (event.initiator instanceof http.ClientRequest) {
          this.emitter.emit(event)
        }
      },
      {
        signal: controller.signal,
      }
    )

    this.subscriptions.push(
      patchesRegistry.applyPatch(http, 'ClientRequest', (ClientRequest) => {
        return new Proxy(ClientRequest, {
          construct(target, args, newTarget) {
            return runInRequestContext(() => {
              return Reflect.construct(target, args, newTarget)
            })
          },
        })
      }),
      patchesRegistry.applyPatch(http, 'get', (httpGet) => {
        return function mockHttpGet(...args) {
          return runInRequestContext(() => {
            return httpGet(...(args as [any, any]))
          })
        }
      }),
      patchesRegistry.applyPatch(http, 'request', (httpRequest) => {
        return function mockHttpRequest(...args) {
          return runInRequestContext(() => {
            return httpRequest(...(args as [any, any]))
          })
        }
      }),
      patchesRegistry.applyPatch(https, 'get', (httpsGet) => {
        return function mockHttpsGet(...args) {
          return runInRequestContext(() => {
            return httpsGet(...(args as [any, any]))
          })
        }
      }),
      patchesRegistry.applyPatch(https, 'request', (httpsRequest) => {
        return function mockHttpsRequest(...args) {
          return runInRequestContext(() => {
            return httpsRequest(...(args as [any, any]))
          })
        }
      })
    )
  }
}
