import type { Emitter } from 'rettime'
import { hasConfigurableGlobal } from '#/src/utils/hasConfigurableGlobal'
import { canParseUrl } from '#/src/utils/canParseUrl'
import { requestContext } from '#/src/request-context'
import { patchesRegistry } from '#/src/utils/patchesRegistry'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { HttpRequestEventMap } from '#/src/events/http'
import { Interceptor } from '../../interceptor'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('fetch')
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
        if (event.initiator instanceof Request) {
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
      if (event.initiator instanceof Request) {
        await this.emitter.emitAsPromise(event)
      }
    }

    const unhandledExceptionListener: Emitter.Listener<
      (typeof httpInterceptor)['emitter'],
      'unhandledException'
    > = async (event) => {
      if (event.initiator instanceof Request) {
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
      patchesRegistry.applyPatch(globalThis, 'fetch', (realFetch) => {
        return (input, init) => {
          /**
           * Resolve potentially relative request URL against the present `location`.
           * This is mainly for native `fetch` in browser-like environments.
           * @see https://github.com/mswjs/msw/issues/1625
           */
          const resolvedInput =
            typeof input === 'string' &&
            typeof location !== 'undefined' &&
            !canParseUrl(input)
              ? new URL(input, location.href)
              : input

          const request = new Request(resolvedInput, init)

          requestContext.enterWith({
            initiator: request,
          })

          return realFetch(input, init)
        }
      })
    )
  }
}
