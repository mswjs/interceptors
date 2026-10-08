import { until } from '@open-draft/until'
import { HttpResponseEvent, type HttpRequestEventMap } from '../../events/http'
import { RequestController } from '../../request-controller'
import { handleRequest } from '../../utils/handle-request'
import { createRequestId } from '../../create-request-id'
import { createNetworkError } from './utils/create-network-error'
import { followFetchRedirect } from './utils/follow-redirect'
import { decompressResponse, isCompressedResponse } from './utils/decompression'
import { cloneResponse } from '../../utils/clone-response'
import { hasConfigurableGlobal } from '../../utils/has-configurable-global'
import { FetchResponse } from '../../utils/fetch-utils'
import { isResponseError } from '../../utils/response-utils'
import { patchesRegistry } from '../../utils/patches-registry'
import { requestContext } from '../../request-context'
import { copyRawHeaders } from '../ClientRequest/utils/record-raw-headers'
import { Interceptor } from '../../interceptor'
import { createLogger } from '../../utils/logger'

const logger = createLogger('fetch')

/**
 * Intercept `fetch` requests in Node.js.
 *
 * @note This interceptor only affects requests performed via
 * the global `fetch` function. To intercept fetch requests performed
 * by other means (e.g. direct `request()` from Undici) use the
 * `HttpRequestInterceptor` instead.
 */
export class FetchInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('fetch-interceptor')

  protected predicate() {
    return hasConfigurableGlobal('fetch')
  }

  protected setup(): void {
    logger.verbose('patching global fetch...')

    this.subscriptions.push(
      patchesRegistry.applyPatch(globalThis, 'fetch', (realFetch) => {
        return async (input, init) => {
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
            !URL.canParse(input)
              ? new URL(input, location.href)
              : input

          const request = new Request(resolvedInput, init)

          const responsePromise = Promise.withResolvers<Response>()

          const controller = new RequestController(
            request,
            {
              passthrough: async () => {
                logger.verbose('performing request as-is')

                /**
                 * @note Perform a clone of the request instance, not the instance itself.
                 * Performing a request consumes its body, and the "response" listener
                 * must still be able to read it. The clone is created right before
                 * the request is performed, so it preserves any modifications made
                 * to the intercepted request in the "request" listener.
                 *
                 * This also keeps the request instance emitted on the "response" event
                 * referentially equal to the one emitted on the "request" event
                 * so the consumer can associate the two by identity.
                 */
                const requestClone = request.clone()

                /**
                 * @note Forward the original request init to the original fetch,
                 * including the options the `Request` instance cannot carry
                 * (e.g. the Undici-specific "dispatcher"). The method, headers,
                 * and body are omitted: the request clone already has them,
                 * including any modifications made by the "request" listener.
                 */
                const fetchInit: RequestInit | undefined =
                  init == null
                    ? undefined
                    : {
                        ...init,
                        method: undefined,
                        headers: undefined,
                        body: undefined,
                      }

                /**
                 * @note Perform the intercepted request as-is, attributing the
                 * connections it opens to this request. A `fetch` implemented
                 * on top of `http` (e.g. the one of "happy-dom") must not be
                 * handled again by the socket-level interceptors.
                 */
                const [responseError, originalResponse] = await until(() =>
                  requestContext.run({ initiator: request, logger }, () =>
                    realFetch(requestClone, fetchInit)
                  )
                )

                if (responseError) {
                  return responsePromise.reject(responseError)
                }

                logger.verbose('original fetch performed %o', originalResponse)

                if (this.emitter.listenerCount('response') > 0) {
                  logger.verbose('emitting the "response" event')

                  const [response, responseClone] =
                    cloneResponse(originalResponse)
                  await this.emitter.emitAsPromise(
                    new HttpResponseEvent({
                      initiator: request,
                      request,
                      requestId,
                      response: responseClone,
                      responseType: 'original',
                    })
                  )

                  responsePromise.resolve(response)
                  return
                }

                // Resolve the response promise with the original response
                // since the `fetch()` return this internal promise.
                responsePromise.resolve(originalResponse)
              },
              respondWith: async (rawResponse) => {
                // Handle mocked `Response.error()` (i.e. request errors).
                if (isResponseError(rawResponse)) {
                  logger.verbose('request errored %o', {
                    response: rawResponse,
                  })
                  responsePromise.reject(createNetworkError(rawResponse))
                  return
                }

                /**
                 * @note Undici never resolves `fetch()` with an informational
                 * response (1xx), treating it as a network error instead.
                 */
                if (rawResponse.status < 200) {
                  responsePromise.reject(
                    createNetworkError(
                      new Error(
                        `Unsupported informational response status: ${rawResponse.status}`
                      )
                    )
                  )
                  return
                }

                /**
                 * @note Forward the mocked response instance as-is.
                 * The only exception is a compressed mocked response body:
                 * a body cannot be swapped in place, so it must be a new instance.
                 */
                let response: Response

                if (isCompressedResponse(rawResponse)) {
                  response = new FetchResponse(
                    decompressResponse(rawResponse),
                    {
                      status: rawResponse.status,
                      statusText: rawResponse.statusText,
                      headers: rawResponse.headers,
                    }
                  )
                  copyRawHeaders(rawResponse.headers, response.headers)
                } else {
                  response = rawResponse
                }

                // Mocked responses have no URL. Mimic the actual fetch
                // and set the response URL to the request URL.
                FetchResponse.setUrl(request.url, response)

                let callerResponse = response

                if (this.emitter.listenerCount('response') > 0) {
                  logger.verbose('emitting the "response" event')

                  const [clonedCallerResponse, responseClone] =
                    cloneResponse(response)
                  callerResponse = clonedCallerResponse

                  // Await the response listeners to finish before resolving
                  // the response promise. This ensures all your logic finishes
                  // before the interceptor resolves the pending response.
                  await this.emitter.emitAsPromise(
                    new HttpResponseEvent({
                      initiator: request,
                      // Clone the mocked response for the "response" event listener.
                      // This way, the listener can read the response and not lock its body
                      // for the actual fetch consumer.
                      response: responseClone,
                      responseType: 'mock',
                      request,
                      requestId,
                    })
                  )
                }

                /**
                 * @note A response to a HEAD request never has a body
                 * (see https://fetch.spec.whatwg.org/#http-network-fetch).
                 * The "response" listeners still observe the mocked response
                 * as it was provided, only the caller receives it body-less.
                 */
                if (request.method === 'HEAD' && callerResponse.body != null) {
                  const headResponse = new FetchResponse(null, {
                    status: callerResponse.status,
                    statusText: callerResponse.statusText,
                    headers: callerResponse.headers,
                  })
                  copyRawHeaders(callerResponse.headers, headResponse.headers)
                  FetchResponse.setUrl(request.url, headResponse)
                  callerResponse = headResponse
                }

                /**
                 * Undici's handling of following redirect responses.
                 * Treat the "manual" redirect mode as a regular mocked response.
                 * This way, the client can manually follow the redirect it receives.
                 * @see https://github.com/nodejs/undici/blob/a6dac3149c505b58d2e6d068b97f4dc993da55f0/lib/web/fetch/index.js#L1173
                 */
                if (FetchResponse.isRedirectResponse(callerResponse.status)) {
                  // Reject the request promise if its `redirect` is set to `error`
                  // and it receives a mocked redirect response.
                  if (request.redirect === 'error') {
                    responsePromise.reject(
                      createNetworkError('unexpected redirect')
                    )
                    return
                  }

                  if (request.redirect === 'follow') {
                    followFetchRedirect(request, callerResponse, {
                      hasStreamingBody: init?.body instanceof ReadableStream,
                    }).then(
                      (response) => {
                        responsePromise.resolve(response)
                      },
                      (reason) => {
                        responsePromise.reject(reason)
                      }
                    )
                    return
                  }
                }

                responsePromise.resolve(callerResponse)
              },
              errorWith: (reason) => {
                logger.verbose('request errored %o', { reason })

                /**
                 * @note Mimic Undici: an aborted request rejects with the abort
                 * reason, any other request error surfaces as the cause of
                 * a "fetch failed" rejection.
                 */
                responsePromise.reject(
                  request.signal.aborted && reason === request.signal.reason
                    ? reason
                    : createNetworkError(reason)
                )
              },
            },
            {
              logger,
              requestId,
            }
          )

          logger.verbose(
            'emitting the "request" event for %s listener(s)...',
            this.emitter.listenerCount('request')
          )

          /**
           * @note Give the consumer a chance to abort the request before
           * it is dispatched. Fetch queues the request processing as a
           * task, so a signal aborted synchronously after `fetch()` must
           * prevent the request from ever reaching the "request" listeners.
           * Without this, the first listener is invoked synchronously
           * within the `fetch()` call itself.
           */
          await Promise.resolve()

          await handleRequest({
            initiator: request,
            request,
            requestId,
            emitter: this.emitter,
            controller,
            logger,
          })

          return responsePromise.promise
        }
      })
    )

    logger.verbose('global fetch patched: %s', globalThis.fetch.name)
  }
}
