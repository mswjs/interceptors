import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { InterceptorError } from './InterceptorError'

const kRequestHandled = Symbol('kRequestHandled')
export const kResponsePromise = Symbol('kResponsePromise')

export interface RequestControllerInit {
  request: Request
  respondWith: (response: Response) => void
  errorWith: (error?: Error) => void
}

export class RequestController {
  /**
   * Internal response promise.
   * Available only for the library internals to grab the
   * response instance provided by the developer.
   * @note This promise cannot be rejected. It's either infinitely
   * pending or resolved with whichever Response was passed to `respondWith()`.
   */
  [kResponsePromise]: DeferredPromise<Response | undefined>;

  /**
   * Internal flag indicating if this request has been handled.
   * @note The response promise becomes "fulfilled" on the next tick.
   */
  [kRequestHandled]: boolean

  constructor(private init: RequestControllerInit) {
    this[kRequestHandled] = false
    this[kResponsePromise] = new DeferredPromise()
  }

  /**
   * Respond to this request with the given `Response` instance.
   * @example
   * controller.respondWith(new Response())
   * controller.respondWith(Response.json({ id }))
   * controller.respondWith(Response.error())
   */
  public respondWith(response: Response): void {
    const { request, respondWith } = this.init

    invariant.as(
      InterceptorError,
      !this[kRequestHandled],
      'Failed to respond to the "%s %s" request: the "request" event has already been handled.',
      request.method,
      request.url
    )

    this[kRequestHandled] = true
    respondWith(response)
    this[kResponsePromise].resolve(response)
  }

  /**
   * Error this request with the given error.
   * @example
   * controller.errorWith()
   * controller.errorWith(new Error('Oops!'))
   */
  public errorWith(error?: Error): void {
    const { request, errorWith } = this.init

    invariant.as(
      InterceptorError,
      !this[kRequestHandled],
      'Failed to error the "%s %s" request: the "request" event has already been handled.',
      request.method,
      request.url
    )

    this[kRequestHandled] = true
    errorWith(error)
  }
}
