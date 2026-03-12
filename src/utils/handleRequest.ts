import type { Emitter } from 'rettime'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { until } from '@open-draft/until'
import {
  HttpRequestEvent,
  HttpRequestEventData,
  UnhandledHttpException,
  type HttpRequestEventMap,
} from '../events/http'
import { RequestController } from '../RequestController'
import {
  createServerErrorResponse,
  isResponseError,
  isResponseLike,
} from './responseUtils'
import { InterceptorError } from '../InterceptorError'
import { isNodeLikeError } from './isNodeLikeError'
import { isObject } from './isObject'

export interface HandleRequestOptions {
  initiator: unknown
  requestId: string
  request: Request
  emitter: Emitter<HttpRequestEventMap>
  controller: RequestController
}

export async function handleRequest(
  options: HandleRequestOptions
): Promise<void> {
  const handleResponse = async (
    response: Response | Error | Record<string, any>
  ) => {
    if (response instanceof Error) {
      await options.controller.errorWith(response)
      return true
    }

    // Handle "Response.error()" instances.
    if (isResponseError(response)) {
      await options.controller.respondWith(response)
      return true
    }

    /**
     * Handle normal responses or response-like objects.
     * @note This must come before the arbitrary object check
     * since Response instances are, in fact, objects.
     */
    if (isResponseLike(response)) {
      await options.controller.respondWith(response)
      return true
    }

    // Handle arbitrary objects provided to `.errorWith(reason)`.
    if (isObject(response)) {
      await options.controller.errorWith(response)
      return true
    }

    return false
  }

  const handleResponseError = async (error: unknown): Promise<boolean> => {
    // Forward the special interceptor error instances
    // to the developer. These must not be handled in any way.
    if (error instanceof InterceptorError) {
      throw result.error
    }

    // Support mocking Node.js-like errors.
    if (isNodeLikeError(error)) {
      await options.controller.errorWith(error)
      return true
    }

    // Handle thrown responses.
    if (error instanceof Response) {
      return await handleResponse(error)
    }

    return false
  }

  const requestAbortPromise = new DeferredPromise<void, unknown>()

  /**
   * @note `signal` is not always defined in React Native.
   */
  if (options.request.signal) {
    if (options.request.signal.aborted) {
      await options.controller.errorWith(options.request.signal.reason)
      return
    }

    options.request.signal.addEventListener(
      'abort',
      () => {
        requestAbortPromise.reject(options.request.signal.reason)
      },
      { once: true }
    )
  }

  const result = await until(async () => {
    // Emit the "request" event and wait until all the listeners
    // for that event are finished (e.g. async listeners awaited).
    // By the end of this promise, the developer cannot affect the
    // request anymore.
    const requestEventData: HttpRequestEventData = {
      initiator: options.initiator,
      requestId: options.requestId,
      request: options.request,
      controller: options.controller,
    }
    const requestEvent = new HttpRequestEvent(requestEventData)
    const requestListenersPromise = options.emitter.emitAsPromise(requestEvent)

    await Promise.race([
      // Short-circuit the request handling promise if the request gets aborted.
      requestAbortPromise,
      requestListenersPromise,
      options.controller.handled,
    ])

    /**
     * @note If the "request" listener has replaced the request instance,
     * propagate that mutation back to the underlying insterceptor.
     * This happens with XMLHttpRequest that replaces request instances
     * to correctly reflect the "withCredentials" option on the Fetch API request.
     */
    if (requestEvent.request !== options.request) {
      options.request = requestEvent.request
    }
  })

  // Handle the request being aborted while waiting for the request listeners.
  if (requestAbortPromise.state === 'rejected') {
    await options.controller.errorWith(requestAbortPromise.rejectionReason)
    return
  }

  if (result.error) {
    // Handle the error during the request listener execution.
    // These can be thrown responses or request errors.
    if (await handleResponseError(result.error)) {
      return
    }

    // If the developer has added "unhandledException" listeners,
    // allow them to handle the error. They can translate it to a
    // mocked response, network error, or forward it as-is.
    if (options.emitter.listenerCount('unhandledException') > 0) {
      // Create a new request controller just for the unhandled exception case.
      // This is needed because the original controller might have been already
      // interacted with (e.g. "respondWith" or "errorWith" called on it).
      const unhandledExceptionController = new RequestController(
        options.request,
        {
          /**
           * @note Intentionally empty passthrough handle.
           * This controller is created within another controller and we only need
           * to know if `unhandledException` listeners handled the request.
           */
          passthrough() {},
          async respondWith(response) {
            await handleResponse(response)
          },
          async errorWith(reason) {
            /**
             * @note Handle the result of the unhandled controller
             * in the same way as the original request controller.
             * The exception here is that thrown errors within the
             * "unhandledException" event do NOT result in another
             * emit of the same event. They are forwarded as-is.
             */
            await options.controller.errorWith(reason)
          },
        }
      )

      await options.emitter.emitAsPromise(
        new UnhandledHttpException({
          initiator: options.initiator,
          error: result.error,
          request: options.request,
          requestId: options.requestId,
          controller: unhandledExceptionController,
        })
      )

      // If all the "unhandledException" listeners have finished
      // but have not handled the request in any way, passthrough.
      if (
        unhandledExceptionController.readyState !== RequestController.PENDING
      ) {
        return
      }
    }

    // Otherwise, coerce unhandled exceptions to a 500 Internal Server Error response.
    await options.controller.respondWith(
      createServerErrorResponse(result.error)
    )
    return
  }

  // If the request hasn't been handled by this point, passthrough.
  if (options.controller.readyState === RequestController.PENDING) {
    return await options.controller.passthrough()
  }

  return options.controller.handled
}
