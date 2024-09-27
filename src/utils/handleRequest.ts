import type { Emitter } from 'strict-event-emitter'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { until } from '@open-draft/until'
import type { HttpRequestEventMap } from '../glossary'
import { emitAsync } from './emitAsync'
import {
  kResponsePromise,
  RequestAbortError,
  RequestController,
} from '../RequestController'
import {
  createServerErrorResponse,
  isResponseError,
  ResponseError,
} from './responseUtils'
import { InterceptorError } from '../InterceptorError'
import { isNodeLikeError } from './isNodeLikeError'

interface HandleRequestOptions {
  requestId: string
  request: Request
  emitter: Emitter<HttpRequestEventMap>
  controller: RequestController

  /**
   * Called when the request has been handled
   * with the given `Response` instance. This covers
   * both returning a mocked response from the interceptor
   * as well as throwing it.
   */
  onResponse: (response: Response) => void | Promise<void>

  /**
   * Called when the request has been handled
   * with the given `Response.error()` instance.
   */
  onRequestError: (response: ResponseError) => void

  /**
   * Called when an unhandled error happens during the
   * request handling. This is never a thrown error/response.
   */
  onError: (error: unknown) => void

  /**
   * Called when the request has been aborted.
   */
  onAbort: (reason: RequestAbortError) => void
}

/**
 * @returns {Promise<boolean>} Indicates whether the request has been handled.
 */
export async function handleRequest(
  options: HandleRequestOptions
): Promise<boolean> {
  const handleResponse = async (responseOrError: Response | Error) => {
    // Handle `controller.abort()`.
    if (responseOrError instanceof RequestAbortError) {
      // Provide the entire error reference so that individual request clients
      // can decide whether to expose it as-is or extract `reason`.
      options.onAbort(responseOrError)
      return true
    }

    if (responseOrError instanceof Error) {
      options.onError(responseOrError)
    }

    // Handle `controller.respondWith(Response.error())`.
    else if (isResponseError(responseOrError)) {
      options.onRequestError(responseOrError)
    } else {
      // Handle `controller.respondWith(new Response())`.
      await options.onResponse(responseOrError)
    }

    return true
  }

  const handleResponseError = async (
    errorOrResponse: unknown
  ): Promise<boolean> => {
    // Ignore the special, developer-facing errors.
    if (errorOrResponse instanceof InterceptorError) {
      throw result.error
    }

    // Handle Node.js-like errors (e.g. ECONNREFUSED).
    if (isNodeLikeError(errorOrResponse)) {
      options.onError(errorOrResponse)
      return true
    }

    // Handle `throw new Response()`.
    if (errorOrResponse instanceof Response) {
      return await handleResponse(errorOrResponse)
    }

    return false
  }

  // Add the last "request" listener to check if the request
  // has been handled in any way. If it hasn't, resolve the
  // response promise with undefined.
  options.emitter.once('request', ({ requestId: pendingRequestId }) => {
    if (pendingRequestId !== options.requestId) {
      return
    }

    if (options.controller[kResponsePromise].state === 'pending') {
      options.controller[kResponsePromise].resolve(undefined)
    }
  })

  const requestAbortPromise = new DeferredPromise<void, unknown>()

  /**
   * @note `signal` is not always defined in React Native.
   */
  if (options.request.signal) {
    // Handle user-issued request aborts by short-circuiting the request handling.
    // No need to call the `onAbort` callback because the user is handling the abort.
    options.request.signal.addEventListener(
      'abort',
      () => {
        console.log('handleRequest: REQ ABORTED!')
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
    const requestListtenersPromise = emitAsync(options.emitter, 'request', {
      requestId: options.requestId,
      request: options.request,
      controller: options.controller,
    })

    await Promise.race([
      // Short-circuit the request handling promise if the request gets aborted.
      requestAbortPromise,
      requestListtenersPromise,
      options.controller[kResponsePromise],
    ])

    // The response promise will settle immediately once
    // the developer calls either "respondWith" or "errorWith".
    const mockedResponse = await options.controller[kResponsePromise]
    return mockedResponse
  })

  // Handle the request being aborted while waiting for the request listeners.
  if (requestAbortPromise.state === 'rejected') {
    options.onError(requestAbortPromise.rejectionReason)
    return true
  }

  if (result.error) {
    // Handle the error during the request listener execution.
    // These can be thrown responses or request errors.
    if (await handleResponseError(result.error)) {
      return true
    }

    // If the developer has added "unhandledException" listeners,
    // allow them to handle the error. They can translate it to a
    // mocked response, network error, or forward it as-is.
    if (options.emitter.listenerCount('unhandledException') > 0) {
      // Create a new request controller just for the unhandled exception case.
      // This is needed because the original controller might have been already
      // interacted with (e.g. "respondWith" or "errorWith" called on it).
      const unhandledExceptionController = new RequestController(
        options.request
      )

      await emitAsync(options.emitter, 'unhandledException', {
        error: result.error,
        request: options.request,
        requestId: options.requestId,
        controller: unhandledExceptionController,
      }).then(() => {
        // If all the "unhandledException" listeners have finished
        // but have not handled the response in any way, preemptively
        // resolve the pending response promise from the new controller.
        // This prevents it from hanging forever.
        if (
          unhandledExceptionController[kResponsePromise].state === 'pending'
        ) {
          unhandledExceptionController[kResponsePromise].resolve(undefined)
        }
      })

      const nextResult = await until(
        () => unhandledExceptionController[kResponsePromise]
      )

      /**
       * @note Handle the result of the unhandled controller
       * in the same way as the original request controller.
       * The exception here is that thrown errors within the
       * "unhandledException" event do NOT result in another
       * emit of the same event. They are forwarded as-is.
       */
      if (nextResult.error) {
        return handleResponseError(nextResult.error)
      }

      if (nextResult.data) {
        return handleResponse(nextResult.data)
      }
    }

    // Otherwise, coerce unhandled exceptions to a 500 Internal Server Error response.
    options.onResponse(createServerErrorResponse(result.error))
    return true
  }

  /**
   * Handle a mocked Response instance.
   * @note That this can also be an Error in case
   * the developer called "errorWith". This differentiates
   * unhandled exceptions from intended errors.
   */
  if (result.data) {
    return handleResponse(result.data)
  }

  // In all other cases, consider the request unhandled.
  // The interceptor must perform it as-is.
  return false
}
