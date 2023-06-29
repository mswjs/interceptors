import { until } from '@open-draft/until'
import type { Logger } from '@open-draft/logger'
import { XMLHttpRequestEmitter } from '.'
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { XMLHttpRequestController } from './XMLHttpRequestController'

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

      const originalRequest = Reflect.construct(target, args, newTarget)

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

      const requestController = new XMLHttpRequestController(
        originalRequest,
        logger
      )

      requestController.onRequest = async function ({ request, requestId }) {
        // Notify the consumer about a new request.
        const interactiveRequest = toInteractiveRequest(request)

        this.logger.info(
          'emitting the "request" event for %s listener(s)...',
          emitter.listenerCount('request')
        )
        emitter.emit('request', {
          request: interactiveRequest,
          requestId,
        })

        this.logger.info('awaiting mocked response...')

        const resolverResult = await until(async () => {
          await emitter.untilIdle(
            'request',
            ({ args: [{ requestId: pendingRequestId }] }) => {
              return pendingRequestId === requestId
            }
          )

          this.logger.info('all "request" listeners settled!')

          const [mockedResponse] =
            await interactiveRequest.respondWith.invoked()

          this.logger.info('event.respondWith called with:', mockedResponse)

          return mockedResponse
        })

        if (resolverResult.error) {
          this.logger.info(
            'request listener threw an exception, aborting request...',
            resolverResult.error
          )

          /**
           * @todo Consider forwarding this error to the stderr as well
           * since not all consumers are expecting to handle errors.
           * If they don't, this error will be swallowed.
           */
          requestController.errorWith(resolverResult.error)
          return
        }

        const mockedResponse = resolverResult.data

        if (typeof mockedResponse !== 'undefined') {
          this.logger.info(
            'received mocked response: %d %s',
            mockedResponse.status,
            mockedResponse.statusText
          )

          return requestController.respondWith(mockedResponse)
        }

        this.logger.info(
          'no mocked response received, performing request as-is...'
        )
      }

      requestController.onResponse = async function ({
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
      return requestController.request
    },
  })

  return XMLHttpRequestProxy
}
