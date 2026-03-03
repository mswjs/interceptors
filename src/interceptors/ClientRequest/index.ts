import http from 'node:http'
import https from 'node:https'
import { HttpRequestEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { runInRequestContext } from '../../request-context'
import { applyPatch } from '#/src/utils/apply-patch'

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

  constructor() {
    super(ClientRequestInterceptor.symbol)
  }

  protected setup(): void {
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
