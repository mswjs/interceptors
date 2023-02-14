import { Response } from '@remix-run/web-fetch'
import { XMLHttpRequestController } from './XMLHttpRequestController'

export function createXMLHttpRequestProxy() {
  const XMLHttpRequestProxy = new Proxy(globalThis.XMLHttpRequest, {
    construct(target, args) {
      const originalRequest = Reflect.construct(target, args)
      const requestController = new XMLHttpRequestController(originalRequest)

      requestController.onRequest = async (request) => {
        console.log('REQUEST!', request.method, request.url)

        /**
         * @todo Lookup relevant interceptors.
         * If this callback returns nothing, the request will be
         * performed as-is.
         */

        requestController.respondWith(new Response(null, { status: 301 }))
      }

      return requestController.request
    },
  })

  return XMLHttpRequestProxy
}
