import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { until } from '@open-draft/until'
import { HttpRequestEventMap, IS_PATCHED_MODULE } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { InterceptorError } from '../../InterceptorError'
import { RequestController, kResponsePromise } from '../../RequestController'
import { emitAsync } from '../../utils/emitAsync'
import { canParseUrl } from '../../utils/canParseUrl'
import { createRequestId } from '../../createRequestId'
import {
  createServerErrorResponse,
  isResponseError,
} from '../../utils/responseUtils'

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
      const responsePromise = new DeferredPromise<Response>()

      const controller = new RequestController({
        request,
        respondWith: (response: Response): void => {
          this.logger.info('responding with a mock response:', response)

          if (this.emitter.listenerCount('response') > 0) {
            this.logger.info('emitting the "response" event...')

            // Clone the mocked response for the "response" event listener.
            // This way, the listener can read the response and not lock its body
            // for the actual fetch consumer.
            const responseClone = response.clone()

            this.emitter.emit('response', {
              response: responseClone,
              isMockedResponse: true,
              request,
              requestId,
            })
          }

          // Set the "response.url" property to equal the intercepted request URL.
          Object.defineProperty(response, 'url', {
            writable: false,
            enumerable: true,
            configurable: false,
            value: request.url,
          })
        },

        errorWith(error) {
          responsePromise.reject(error)
        },
      })

      this.logger.info('[%s] %s', request.method, request.url)

      this.logger.info(
        'emitting the "request" event for %d listener(s)...',
        this.emitter.listenerCount('request')
      )

      this.emitter.once('request', ({ requestId: pendingRequestId }) => {
        if (pendingRequestId !== requestId) {
          return
        }

        if (controller[kResponsePromise].state === 'pending') {
          controller[kResponsePromise].resolve(undefined)
        }
      })

      this.logger.info('awaiting for the mocked response...')

      const requestAbortPromise = new DeferredPromise()

      // Signal isn't always defined in react-native.
      if (request.signal) {
        request.signal.addEventListener(
          'abort',
          () => {
            requestAbortPromise.reject(request.signal.reason)
          },
          { once: true }
        )
      }

      const resolverResult = await until<unknown, Response | undefined>(
        async () => {
          const requestListenersPromise = emitAsync(this.emitter, 'request', {
            request,
            requestId,
            controller,
          })

          await Promise.race([
            requestAbortPromise,
            // Put the listeners invocation Promise in the same race condition
            // with the request abort Promise because otherwise awaiting the listeners
            // would always yield some response (or undefined).
            requestListenersPromise,
            controller[kResponsePromise],
          ])

          this.logger.info('all request listeners have been resolved!')

          const mockedResponse = await controller[kResponsePromise]
          this.logger.info('event.respondWith called with:', mockedResponse)

          return mockedResponse
        }
      )

      // Handle "controller.errorWith()" calls.
      // Those reject the response promise immediately
      // and the resolver result will have no data and no errors.
      if (responsePromise.state === 'rejected') {
        return responsePromise
      }

      // Handle request being aborted while waiting for the mocked response.
      if (requestAbortPromise.state === 'rejected') {
        this.logger.info(
          'request has been aborted:',
          requestAbortPromise.rejectionReason
        )

        responsePromise.reject(requestAbortPromise.rejectionReason)
        return responsePromise
      }

      // Handle an error occurring in the request event listener.
      if (resolverResult.error) {
        this.logger.info(
          'request listerner threw an error:',
          resolverResult.error
        )

        // Treat thrown Responses as mocked responses.
        if (resolverResult.error instanceof Response) {
          // Treat thrown Response.error() as a request error.
          if (isResponseError(resolverResult.error)) {
            responsePromise.reject(createNetworkError(resolverResult.error))
          } else {
            // Treat the rest of thrown Responses as mocked responses.
            responsePromise.resolve(resolverResult.error)
          }
        }

        // Forward internal interceptor errors to the developer as-is.
        // These are by design developer-facing and must not be handled
        // in any other way.
        if (resolverResult.error instanceof InterceptorError) {
          throw resolverResult.error
        }

        // Emit the "unhandledException" interceptor event so the client
        // can opt-out from exceptions translating to 500 error responses.
        if (this.emitter.listenerCount('unhandledException') > 0) {
          await emitAsync(this.emitter, 'unhandledException', {
            error: resolverResult.error,
            request,
            requestId,
            /**
             * @fixme This is a bit odd. This listener accepts a controller
             * but it's not a conventional controller from "request".
             * There will be noting awaiting these respondWith() calls.
             * This controller has to hook into "responsePromise" directly.
             */
            controller: new RequestController({
              request,
              /**
               * @fixme This is still wrong. This should emit the "response"
               * event, I think. It will not. This whole handling in fetch
               * may need redesigning.
               */
              respondWith: (response) => responsePromise.resolve(response),
              errorWith: (error) => responsePromise.reject(error),
            }),
          })

          // If the "unhandledException" listener handled the request
          // in any way, return the response promise.
          if (responsePromise.state !== 'pending') {
            return responsePromise
          }
        }

        // Unhandled exceptions in the request listeners are
        // synonymous to unhandled exceptions on the server.
        // Those are represented as 500 error responses.
        responsePromise.resolve(createServerErrorResponse(resolverResult.error))
        return responsePromise
      }

      const mockedResponse = resolverResult.data

      if (mockedResponse && !request.signal?.aborted) {
        this.logger.info('received mocked response:', mockedResponse)

        // Reject the request Promise on mocked "Response.error" responses.
        if (isResponseError(mockedResponse)) {
          this.logger.info(
            'received a network error response, rejecting the request promise...'
          )

          /**
           * Set the cause of the request promise rejection to the
           * network error Response instance. This differs from Undici.
           * Undici will forward the "response.error" custom property
           * as the rejection reason but for "Response.error()" static method
           * "response.error" will equal to undefined, making "cause" an empty Error.
           * @see https://github.com/nodejs/undici/blob/83cb522ae0157a19d149d72c7d03d46e34510d0a/lib/fetch/response.js#L344
           */
          responsePromise.reject(createNetworkError(mockedResponse))
        } else {
          responsePromise.resolve(mockedResponse)
        }

        return responsePromise
      }

      this.logger.info('no mocked response received!')

      return pureFetch(request).then((response) => {
        this.logger.info('original fetch performed', response)

        if (this.emitter.listenerCount('response') > 0) {
          this.logger.info('emitting the "response" event...')

          const responseClone = response.clone()

          this.emitter.emit('response', {
            response: responseClone,
            isMockedResponse: false,
            request,
            requestId,
          })
        }

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
