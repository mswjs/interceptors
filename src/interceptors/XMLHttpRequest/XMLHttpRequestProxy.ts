import type { Emitter } from 'rettime'
import { HttpResponseEvent, type HttpRequestEventMap } from '../../events/http'
import { RequestController } from '../../RequestController'
import { XMLHttpRequestController } from './XMLHttpRequestController'
import { handleRequest } from '../../utils/handleRequest'
import type { Logger } from '../../utils/logger'

export interface XMLHttpRequestProxyOptions {
  emitter: Emitter<HttpRequestEventMap>
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
      logger.verbose('constructed new XMLHttpRequest')

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
        const controller = new RequestController(request, {
          passthrough: () => {
            this.logger.verbose(
              'no mocked response received, performing request as-is...'
            )
          },
          respondWith: async (response) => {
            await this.respondWith(response)
          },
          errorWith: (reason) => {
            this.logger.verbose('request errored %o', { error: reason })

            if (reason instanceof Error) {
              this.errorWith(reason)
            }
          },
        }, {
          logger,
          requestId,
        })

        this.logger.verbose('awaiting mocked response')

        this.logger.verbose(
          'emitting the "request" event for %s listener(s)...',
          emitter.listenerCount('request')
        )

        await handleRequest({
          initiator: this.request,
          request,
          requestId,
          controller,
          emitter,
          logger,
        })
      }

      xhrRequestController.onResponse = async function ({
        response,
        responseType,
        request,
        requestId,
      }) {
        this.logger.verbose(
          'emitting the "response" event for %s listener(s)...',
          emitter.listenerCount('response')
        )

        await emitter.emitAsPromise(
          new HttpResponseEvent({
            initiator: this.request,
            response,
            responseType,
            request,
            requestId,
          })
        )
      }

      // Return the proxied request from the controller
      // so that the controller can react to the consumer's interactions
      // with this request (opening/sending/etc).
      return xhrRequestController.request
    },
  })

  return XMLHttpRequestProxy
}
