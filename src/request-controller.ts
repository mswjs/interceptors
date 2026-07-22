import { invariant } from 'outvariant'
import { InterceptorError } from './interceptor-error'
import { formatResponse, type Logger } from './utils/logger'

export interface RequestControllerSource {
  passthrough(): void | Promise<void>
  respondWith(response: Response): void | Promise<void>
  errorWith(reason?: unknown): void | Promise<void>
}

interface RequestControllerOptions {
  logger: Logger
  requestId: string
}

export class RequestController {
  static PENDING = 0 as const
  static PASSTHROUGH = 1 as const
  static RESPONSE = 2 as const
  static ERROR = 3 as const

  public readyState: number

  /**
   * A Promise that resolves when this controller handles a request.
   * See `controller.readyState` for more information on the handling result.
   */
  public handled: Promise<void>

  readonly #handled: PromiseWithResolvers<void>

  constructor(
    protected readonly request: Request,
    protected readonly source: RequestControllerSource,
    protected readonly options?: RequestControllerOptions
  ) {
    this.readyState = RequestController.PENDING
    this.#handled = Promise.withResolvers<void>()
    this.handled = this.#handled.promise
  }

  /**
   * Perform this request as-is.
   */
  public async passthrough(): Promise<void> {
    invariant.as(
      InterceptorError,
      this.readyState === RequestController.PENDING,
      'Failed to passthrough the "%s %s" request: the request has already been handled',
      this.request.method,
      this.request.url
    )

    this.readyState = RequestController.PASSTHROUGH
    if (this.options) {
      this.options.logger.info('[%s] passthrough', this.options.requestId)
    }
    await this.source.passthrough()
    this.#handled.resolve()
  }

  /**
   * Respond to this request with the given `Response` instance.
   *
   * @example
   * controller.respondWith(new Response())
   * controller.respondWith(Response.json({ id }))
   * controller.respondWith(Response.error())
   */
  public respondWith(response: Response): void {
    invariant.as(
      InterceptorError,
      this.readyState === RequestController.PENDING,
      'Failed to respond to the "%s %s" request with "%d %s": the request has already been handled (%d)',
      this.request.method,
      this.request.url,
      response.status,
      response.statusText || 'OK',
      this.readyState
    )

    this.readyState = RequestController.RESPONSE
    if (this.options?.logger.isEnabled('default')) {
      const { logger, requestId } = this.options

      void formatResponse(response).then((message) => {
        logger.info('[%s] mocked %s', requestId, message)
      })
    }
    this.#handled.resolve()

    /**
     * @note Although `source.respondWith()` is potentially asynchronous,
     * do NOT await it for backward-compatibility. Awaiting it will short-circuit
     * the request listener invocation as soon as a listener responds to a request.
     * Ideally, that's what we want, but that's not what we promise the user.
     */
    this.source.respondWith(response)
  }

  /**
   * Error this request with the given reason.
   *
   * @example
   * controller.errorWith()
   * controller.errorWith(new Error('Oops!'))
   * controller.errorWith({ message: 'Oops!'})
   */
  public errorWith(reason?: unknown): void {
    invariant.as(
      InterceptorError,
      this.readyState === RequestController.PENDING,
      'Failed to error the "%s %s" request with "%s": the request has already been handled (%d)',
      this.request.method,
      this.request.url,
      reason?.toString(),
      this.readyState
    )

    this.readyState = RequestController.ERROR
    if (this.options) {
      this.options.logger.info(
        '[%s] error %o',
        this.options.requestId,
        reason
      )
    }
    this.source.errorWith(reason)
    this.#handled.resolve()
  }
}
