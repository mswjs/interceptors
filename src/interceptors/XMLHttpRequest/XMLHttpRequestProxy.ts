import { until } from '@open-draft/until'
import { Headers } from '@remix-run/web-fetch'
import { XMLHttpRequestEmitter } from '.'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { uuidv4 } from '../../utils/uuid'
import { XMLHttpRequestController } from './XMLHttpRequestController'

export function createXMLHttpRequestProxy(emitter: XMLHttpRequestEmitter) {
  const XMLHttpRequestProxy = new Proxy(globalThis.XMLHttpRequest, {
    construct(target, args) {
      const originalRequest = Reflect.construct(target, args)
      const requestController = new XMLHttpRequestController(originalRequest)

      requestController.onRequest = async (request) => {
        const requestId = uuidv4()

        // Notify the consumer about a new request.
        const interactiveRequest = toInteractiveRequest(request)
        emitter.emit('request', interactiveRequest, requestId)

        const [middlewareException, mockedResponse] = await until(async () => {
          await emitter.untilIdle(
            'request',
            ({ args: [, pendingRequestId] }) => {
              return pendingRequestId === requestId
            }
          )

          const [mockedResponse] =
            await interactiveRequest.respondWith.invoked()
          return mockedResponse
        })

        if (middlewareException) {
          requestController.errorWith(middlewareException)
          return
        }

        if (typeof mockedResponse !== 'undefined') {
          const responseClone = mockedResponse.clone()

          requestController.respondWith(mockedResponse)

          emitter.emit('response', responseClone, interactiveRequest, requestId)
        }

        /**
         * @todo Also get the original response here and emit "response" event.
         */
      }

      // Return the proxied request from the controller
      // so that the controller can react to the consumer's interactions
      // with this request (opening/sending/etc).
      return requestController.request
    },
  })

  return XMLHttpRequestProxy
}
