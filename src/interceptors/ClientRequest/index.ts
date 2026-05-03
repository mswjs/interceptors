import http from 'node:http'
import https from 'node:https'
import type { Emitter } from 'rettime'
import { requestContext, runInRequestContext } from '#/src/request-context'
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
      async (event) => {
        if (event.initiator instanceof http.ClientRequest) {
          await this.emitter.emitAsPromise(event)
        }
      },
      {
        signal: controller.signal,
      }
    )

    const responseListener: Emitter.Listener<
      (typeof httpInterceptor)['emitter'],
      'response'
    > = async (event) => {
      if (event.initiator instanceof http.ClientRequest) {
        await this.emitter.emitAsPromise(event)
      }
    }

    const unhandledExceptionListener: Emitter.Listener<
      (typeof httpInterceptor)['emitter'],
      'unhandledException'
    > = async (event) => {
      if (event.initiator instanceof http.ClientRequest) {
        await this.emitter.emitAsPromise(event)
      }
    }

    this.emitter.hooks.on(
      'newListener',
      (type) => {
        if (
          type === 'response' &&
          !httpInterceptor.listeners('response').includes(responseListener)
        ) {
          httpInterceptor.on('response', responseListener, {
            signal: controller.signal,
          })
        }

        if (
          type === 'unhandledException' &&
          !httpInterceptor
            .listeners('unhandledException')
            .includes(unhandledExceptionListener)
        ) {
          httpInterceptor.on('unhandledException', unhandledExceptionListener, {
            signal: controller.signal,
          })
        }
      },
      {
        signal: controller.signal,
        persist: true,
      }
    )

    this.emitter.hooks.on(
      'removeListener',
      (type) => {
        if (
          type === 'response' &&
          this.emitter.listenerCount('response') === 0
        ) {
          httpInterceptor.removeListener('response', responseListener)
        }

        if (
          type === 'unhandledException' &&
          this.emitter.listenerCount('unhandledException') === 0
        ) {
          httpInterceptor.removeListener(
            'unhandledException',
            unhandledExceptionListener
          )
        }
      },
      {
        signal: controller.signal,
        persist: true,
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
