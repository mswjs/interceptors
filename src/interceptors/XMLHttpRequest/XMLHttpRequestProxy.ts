import { until } from '@open-draft/until'
import type { Logger } from '@open-draft/logger'
import { XMLHttpRequestEmitter } from '.'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'
import { XMLHttpRequestController } from './XMLHttpRequestController'
import {
  createServerErrorResponse,
  isResponseError,
} from '../../utils/responseUtils'

export interface XMLHttpRequestProxyOptions {
  emitter: XMLHttpRequestEmitter
  logger: Logger
}

/**
 * Create a proxied `XMLHttpRequest` class.
 * The proxied class establishes spies on certain methods,
 * allowing us to intercept requests and respond to them.
 */
export function createXMLHttpRequestProxy({
  emitter,
  logger,
}: XMLHttpRequestProxyOptions) {
  const XMLHttpRequestProxy = new Proxy(globalThis.XMLHttpRequest, {
    construct(target, args, newTarget) {
      logger.info('constructed new XMLHttpRequest')

      const originalRequest = Reflect.construct(
        target,
        args,
        newTarget
      ) as XMLHttpRequest

      /**
       * @note Forward prototype descriptors onto the proxied object.
       * XMLHttpRequest is implemented in JSDOM in a way that assigns
       * a bunch of descriptors, like "set responseType()" on the prototype.
       * With this propagation, we make sure that those descriptors trigger
       * when the user operates with the proxied request instance.
       */
      const prototypeDescriptors = Object.getOwnPropertyDescriptors(
        target.prototype
      )
      for (const propertyName in prototypeDescriptors) {
        Reflect.defineProperty(
          originalRequest,
          propertyName,
          prototypeDescriptors[propertyName]
        )
      }

      const xhrRequestController = new XMLHttpRequestController(
        originalRequest,
        logger
      )

      xhrRequestController.onRequest = async function ({ request, requestId }) {
        const { interactiveRequest, requestController } =
          toInteractiveRequest(request)

        this.logger.info('awaiting mocked response...')

        emitter.once('request', ({ requestId: pendingRequestId }) => {
          if (pendingRequestId !== requestId) {
            return
          }

          if (requestController.responsePromise.state === 'pending') {
            requestController.respondWith(undefined)
          }
        })

        const resolverResult = await until(async () => {
          this.logger.info(
            'emitting the "request" event for %s listener(s)...',
            emitter.listenerCount('request')
          )

          await emitAsync(emitter, 'request', {
            request: interactiveRequest,
            requestId,
          })

          this.logger.info('all "request" listeners settled!')

          const mockedResponse = await requestController.responsePromise

          this.logger.info('event.respondWith called with:', mockedResponse)

          return mockedResponse
        })

        if (resolverResult.error) {
          this.logger.info(
            'request listener threw an exception, aborting request...',
            resolverResult.error
          )

          // Treat thrown Responses as mocked responses.
          if (resolverResult.error instanceof Response) {
            if (isResponseError(resolverResult.error)) {
              xhrRequestController.errorWith(new TypeError('Network error'))
            } else {
              this.respondWith(resolverResult.error)
            }

            return
          }

          if (emitter.listenerCount('unhandledException') > 0) {
            // Emit the "unhandledException" event so the client can opt-out
            // from the default exception handling (producing 500 error responses).
            await emitAsync(emitter, 'unhandledException', {
              error: resolverResult.error,
              request,
              requestId,
              controller: {
                respondWith:
                  xhrRequestController.respondWith.bind(xhrRequestController),
                errorWith:
                  xhrRequestController.errorWith.bind(xhrRequestController),
              },
            })

            // If any of the "unhandledException" listeners handled the request,
            // do nothing. Note that mocked responses will dispatch
            // HEADERS_RECEIVED (2), then LOADING (3), and DONE (4) can take
            // time as the mocked response body finishes streaming.
            if (originalRequest.readyState > XMLHttpRequest.OPENED) {
              return
            }
          }

          // Unhandled exceptions in the request listeners are
          // synonymous to unhandled exceptions on the server.
          // Those are represented as 500 error responses.
          xhrRequestController.respondWith(
            createServerErrorResponse(resolverResult.error)
          )

          return
        }

        const mockedResponse = resolverResult.data

        if (typeof mockedResponse !== 'undefined') {
          this.logger.info(
            'received mocked response: %d %s',
            mockedResponse.status,
            mockedResponse.statusText
          )

          if (isResponseError(mockedResponse)) {
            this.logger.info(
              'received a network error response, rejecting the request promise...'
            )

            xhrRequestController.errorWith(new TypeError('Network error'))
            return
          }

          return xhrRequestController.respondWith(mockedResponse)
        }

        this.logger.info(
          'no mocked response received, performing request as-is...'
        )
      }

      xhrRequestController.onResponse = async function ({
        response,
        isMockedResponse,
        request,
        requestId,
      }) {
        this.logger.info(
          'emitting the "response" event for %s listener(s)...',
          emitter.listenerCount('response')
        )

        emitter.emit('response', {
          response,
          isMockedResponse,
          request,
          requestId,
        })
      }

      // Return the proxied request from the controller
      // so that the controller can react to the consumer's interactions
      // with this request (opening/sending/etc).
      return xhrRequestController.request
    },
  })

  return XMLHttpRequestProxy
}
