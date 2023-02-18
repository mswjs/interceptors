import type { Debugger } from 'debug'
import { until } from '@open-draft/until'
import { XMLHttpRequestEmitter } from '.'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { XMLHttpRequestController } from './XMLHttpRequestController'

export interface XMLHttpRequestProxyOptions {
  emitter: XMLHttpRequestEmitter
  log: Debugger
}

/**
 * Create a proxied `XMLHttpRequest` class.
 * The proxied class establishes spies on certain methods,
 * allowing us to intercept requests and respond to them.
 */
export function createXMLHttpRequestProxy({
  emitter,
  log,
}: XMLHttpRequestProxyOptions) {
  const XMLHttpRequestProxy = new Proxy(globalThis.XMLHttpRequest, {
    construct(target, args) {
      log('constructed new XMLHttpRequest')

      const originalRequest = Reflect.construct(target, args)

      const requestController = new XMLHttpRequestController(
        originalRequest,
        log
      )

      requestController.onRequest = async function (request, requestId) {
        // Notify the consumer about a new request.
        const interactiveRequest = toInteractiveRequest(request)

        this.log(
          'emitting the "request" event for %s listener(s)...',
          emitter.listenerCount('request')
        )
        emitter.emit('request', interactiveRequest, requestId)

        this.log('awaiting mocked response...')

        const [middlewareException, mockedResponse] = await until(async () => {
          await emitter.untilIdle(
            'request',
            ({ args: [, pendingRequestId] }) => {
              return pendingRequestId === requestId
            }
          )

          this.log('all "request" listeners settled!')

          const [mockedResponse] =
            await interactiveRequest.respondWith.invoked()

          this.log('event.respondWith called with:', mockedResponse)

          return mockedResponse
        })

        if (middlewareException) {
          this.log(
            'request listener threw an exception, aborting request...',
            middlewareException
          )

          /**
           * @todo Consider forwarding this error to the stderr as well
           * since not all consumers are expecting to handle errors.
           * If they don't, this error will be swallowed.
           */
          requestController.errorWith(middlewareException)
          return
        }

        if (typeof mockedResponse !== 'undefined') {
          this.log(
            'received mocked response: %d %s',
            mockedResponse.status,
            mockedResponse.statusText
          )

          return requestController.respondWith(mockedResponse)
        }

        this.log('no mocked response received, performing request as-is...')
      }

      requestController.onResponse = async function (
        response,
        request,
        requestId
      ) {
        this.log(
          'emitting the "response" event for %s listener(s)...',
          emitter.listenerCount('response')
        )

        emitter.emit('response', response, request, requestId)
      }

      // Return the proxied request from the controller
      // so that the controller can react to the consumer's interactions
      // with this request (opening/sending/etc).
      return requestController.request
    },
  })

  return XMLHttpRequestProxy
}
