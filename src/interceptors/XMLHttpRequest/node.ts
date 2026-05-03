import type { Emitter } from 'rettime'
import { requestContext } from '#/src/request-context'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { Interceptor } from '#/src/interceptor'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
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
    const httpInterceptor = Interceptor.singleton(HttpRequestInterceptor)
    httpInterceptor.apply()
    this.subscriptions.push(() => httpInterceptor.dispose())

    const controller = new AbortController()
    this.subscriptions.push(() => controller.abort())

    httpInterceptor.on(
      'request',
      async (event) => {
        if (event.initiator instanceof XMLHttpRequest) {
          event.request = this.#transformRequest(event.request, event.initiator)
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
      if (event.initiator instanceof XMLHttpRequest) {
        event.request = this.#transformRequest(event.request, event.initiator)
        await this.emitter.emitAsPromise(event)
      }
    }

    const unhandledExceptionListener: Emitter.Listener<
      (typeof httpInterceptor)['emitter'],
      'unhandledException'
    > = async (event) => {
      if (event.initiator instanceof XMLHttpRequest) {
        event.request = this.#transformRequest(event.request, event.initiator)
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

    log('patching global "XMLHttpRequest"...')

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
              requestContext.enterWith({ initiator: xmlHttpRequest })

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
