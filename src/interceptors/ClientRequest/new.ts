import http from 'node:http'
import https from 'node:https'
import { HttpRequestEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { runInRequestContext } from '../../request-context'

export class ClientRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

  constructor() {
    super(ClientRequestInterceptor.symbol)
  }

  protected setup(): void {
    const RealClientRequest = http.ClientRequest

    http.ClientRequest = new Proxy(http.ClientRequest, {
      construct(target, args, newTarget) {
        return runInRequestContext(() => {
          return Reflect.construct(target, args, newTarget)
        })
      },
    })

    const { get: realHttpGet, request: realHttpRequest } = http
    http.get = new Proxy(http.get, {
      apply(target, thisArg, argArray) {
        return runInRequestContext(() => {
          return Reflect.apply(target, thisArg, argArray)
        })
      },
    })
    http.request = new Proxy(http.request, {
      apply(target, thisArg, argArray) {
        return runInRequestContext(() => {
          return Reflect.apply(target, thisArg, argArray)
        })
      },
    })

    const { get: realHttpsGet, request: realHttpsRequest } = https
    https.get = new Proxy(http.get, {
      apply(target, thisArg, argArray) {
        return runInRequestContext(() => {
          return Reflect.apply(target, thisArg, argArray)
        })
      },
    })
    https.request = new Proxy(http.request, {
      apply(target, thisArg, argArray) {
        return runInRequestContext(() => {
          return Reflect.apply(target, thisArg, argArray)
        })
      },
    })

    this.subscriptions.push(() => {
      http.ClientRequest = RealClientRequest

      http.get = realHttpGet
      http.request = realHttpRequest
      https.get = realHttpsGet
      https.request = realHttpsRequest
    })
  }
}
