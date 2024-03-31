import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { until } from '@open-draft/until'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'
import { isPropertyAccessible } from '../../utils/isPropertyAccessible'
import { canParseUrl } from '../../utils/canParseUrl'
import { createRequestId } from '../../createRequestId'

export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('fetch')

  constructor() {
    super(FetchInterceptor.symbol)
  }

  protected checkEnvironment() {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.fetch !== 'undefined'
    )
  }

  protected async setup() {
    const pureFetch = globalThis.fetch

    invariant(
      !(pureFetch as any)[IS_PATCHED_MODULE],
      'Failed to patch the "fetch" module: already patched.'
    )

    globalThis.fetch = async (input, init) => {
      const requestId = createRequestId()

      /**
       * @note Resolve potentially relative request URL
       * against the present `location`. This is mainly
       * for native `fetch` in JSDOM.
       * @see https://github.com/mswjs/msw/issues/1625
       */
      const resolvedInput =
        typeof input === 'string' &&
        typeof location !== 'undefined' &&
        !canParseUrl(input)
          ? new URL(input, location.origin)
          : input

      const request = new Request(resolvedInput, init)

      this.logger.info('[%s] %s', request.method, request.url)

      const { interactiveRequest, requestController } =
        toInteractiveRequest(request)

      this.logger.info(
        'emitting the "request" event for %d listener(s)...',
        this.emitter.listenerCount('request')
      )

      this.emitter.once('request', ({ requestId: pendingRequestId }) => {
        if (pendingRequestId !== requestId) {
          return
        }

        if (requestController.responsePromise.state === 'pending') {
          requestController.responsePromise.resolve(undefined)
        }
      })

      this.logger.info('awaiting for the mocked response...')

      const signal = interactiveRequest.signal
      const requestAborted = new DeferredPromise()

      // Signal isn't always defined in react-native.
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            requestAborted.reject(signal.reason)
          },
          { once: true }
        )
      }

      const resolverResult = await until(async () => {
        const listenersFinished = emitAsync(this.emitter, 'request', {
          request: interactiveRequest,
          requestId,
        })

        await Promise.race([
          requestAborted,
          // Put the listeners invocation Promise in the same race condition
          // with the request abort Promise because otherwise awaiting the listeners
          // would always yield some response (or undefined).
          listenersFinished,
          requestController.responsePromise,
        ])

        this.logger.info('all request listeners have been resolved!')

        const mockedResponse = await requestController.responsePromise
        this.logger.info('event.respondWith called with:', mockedResponse)

        return mockedResponse
      })

      if (requestAborted.state === 'rejected') {
        return Promise.reject(requestAborted.rejectionReason)
      }

      if (resolverResult.error) {
        return Promise.reject(createNetworkError(resolverResult.error))
      }

      const mockedResponse = resolverResult.data

      if (mockedResponse && !request.signal?.aborted) {
        this.logger.info('received mocked response:', mockedResponse)

        // Reject the request Promise on mocked "Response.error" responses.
        if (
          isPropertyAccessible(mockedResponse, 'type') &&
          mockedResponse.type === 'error'
        ) {
          this.logger.info(
            'received a network error response, rejecting the request promise...'
          )

          /**
           * Set the cause of the request promise rejection to the
           * network error Response instance. This different from Undici.
           * Undici will forward the "response.error" custom property
           * as the rejection reason but for "Response.error()" static method
           * "response.error" will equal to undefined, making "cause" an empty Error.
           * @see https://github.com/nodejs/undici/blob/83cb522ae0157a19d149d72c7d03d46e34510d0a/lib/fetch/response.js#L344
           */
          return Promise.reject(createNetworkError(mockedResponse))
        }

        // Clone the mocked response for the "response" event listener.
        // This way, the listener can read the response and not lock its body
        // for the actual fetch consumer.
        const responseClone = mockedResponse.clone()

        this.emitter.emit('response', {
          response: responseClone,
          isMockedResponse: true,
          request: interactiveRequest,
          requestId,
        })

        // Set the "response.url" property to equal the intercepted request URL.
        Object.defineProperty(mockedResponse, 'url', {
          writable: false,
          enumerable: true,
          configurable: false,
          value: request.url,
        })

        return mockedResponse
      }

      this.logger.info('no mocked response received!')

      return pureFetch(request).then((response) => {
        const responseClone = response.clone()
        this.logger.info('original fetch performed', responseClone)

        this.emitter.emit('response', {
          response: responseClone,
          isMockedResponse: false,
          request: interactiveRequest,
          requestId,
        })

        return response
      })
    }

    Object.defineProperty(globalThis.fetch, IS_PATCHED_MODULE, {
      enumerable: true,
      configurable: true,
      value: true,
    })

    this.subscriptions.push(() => {
      Object.defineProperty(globalThis.fetch, IS_PATCHED_MODULE, {
        value: undefined,
      })

      globalThis.fetch = pureFetch

      this.logger.info(
        'restored native "globalThis.fetch"!',
        globalThis.fetch.name
      )
    })
  }
}

function createNetworkError(cause: unknown) {
  return Object.assign(new TypeError('Failed to fetch'), {
    cause,
  })
}
