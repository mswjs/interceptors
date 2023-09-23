import { ClientRequest, IncomingMessage } from 'http'
import { Readable } from 'stream'
import { invariant } from 'outvariant'
import type { Logger } from '@open-draft/logger'
import { DeferredPromise } from '@open-draft/deferred-promise'
import type { ClientRequestEmitter } from '.'
import {
  ClientRequestEndCallback,
  ClientRequestEndChunk,
  normalizeClientRequestEndArgs,
} from './utils/normalizeClientRequestEndArgs'
import { NormalizedClientRequestArgs } from './utils/normalizeClientRequestArgs'
import {
  ClientRequestWriteArgs,
  normalizeClientRequestWriteArgs,
} from './utils/normalizeClientRequestWriteArgs'
import { cloneIncomingMessage } from './utils/cloneIncomingMessage'
import { createResponse } from './utils/createResponse'
import { createRequest } from './utils/createRequest'
import {
  InteractiveRequest,
  toInteractiveRequest,
} from '../../utils/toInteractiveRequest'
import { uuidv4 } from '../../utils/uuid'
import { emitAsync } from '../../utils/emitAsync'
import { RequestController } from '../../utils/RequestController'

export type Protocol = 'http' | 'https'

export interface NodeClientOptions {
  emitter: ClientRequestEmitter
  logger: Logger
}

export class NodeClientRequest extends ClientRequest {
  /**
   * The list of internal Node.js errors to suppress while
   * using the "mock" response source.
   */
  static suppressErrorCodes = [
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'EAI_AGAIN',
  ]

  public url: URL

  private fetchRequest?: Request
  private requestId: string
  private chunks: Array<{
    chunk?: string | Buffer
    encoding?: BufferEncoding | null
  }> = []
  private requestBodyStream: Readable
  private isRequestSent: boolean = false

  private response: IncomingMessage
  private responsePromise?: Promise<Response | undefined>
  private emitter: ClientRequestEmitter
  private logger: Logger
  private responseSource: 'mock' | 'bypass' = 'mock'
  private capturedError?: NodeJS.ErrnoException

  constructor(
    [url, requestOptions, callback]: NormalizedClientRequestArgs,
    options: NodeClientOptions
  ) {
    super(requestOptions, callback)

    this.logger = options.logger.extend(
      `request ${requestOptions.method} ${url.href}`
    )

    this.logger.info('constructing ClientRequest using options:', {
      url,
      requestOptions,
      callback,
    })

    this.requestId = uuidv4()
    this.url = url
    this.emitter = options.emitter

    this.requestBodyStream = new Readable({
      read() {},
    })

    // Construct a mocked response message.
    this.response = new IncomingMessage(this.socket!)
  }

  get request(): Request {
    invariant(
      this.fetchRequest,
      'Failed to retrieve the "request" property on NodeClientRequest: request has not been represented as a Fetch API request yet'
    )

    return this.fetchRequest
  }

  private writeRequestBodyChunk(
    chunk: string | Buffer | null,
    encoding?: BufferEncoding | null
  ): void {
    if (chunk === null) {
      this.requestBodyStream.push(null)
      return
    }

    const resolvedChunk = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, encoding || undefined)

    this.requestBodyStream.push(resolvedChunk)
  }

  write(...args: ClientRequestWriteArgs): boolean {
    const [chunk, encoding, callback] = normalizeClientRequestWriteArgs(args)
    this.logger.info('write:', { chunk, encoding, callback })

    this.chunks.push({ chunk, encoding })

    // Write each request body chunk to the internal buffer.
    this.writeRequestBodyChunk(chunk, encoding)

    this.logger.info(
      'chunk successfully written!',
      this.requestBodyStream.readableLength
    )

    /**
     * Prevent invoking the callback if the written chunk is empty.
     * @see https://nodejs.org/api/http.html#requestwritechunk-encoding-callback
     */
    if (!chunk || chunk.length === 0) {
      this.logger.info('written chunk is empty, skipping callback...')
    } else {
      callback?.()
    }

    // Do not write the request body chunks to prevent
    // the Socket from sending data to a potentially existing
    // server when there is a mocked response defined.
    return true
  }

  end(...args: any): this {
    this.logger.info('end', args)

    const [chunk, encoding, callback] = normalizeClientRequestEndArgs(...args)
    this.logger.info('normalized arguments:', { chunk, encoding, callback })

    // Write the last request body chunk passed to the "end()" method.
    this.writeRequestBodyChunk(chunk, encoding || undefined)

    // Write null to end the internal request body stream.
    this.requestBodyStream.push(null)

    if (this.isRequestSent) {
      if (!this.responsePromise) {
        return this.passthrough(chunk, encoding, callback)
      }

      this.responsePromise.then((mockedResponse) => {
        if (!mockedResponse) {
          return this.passthrough(chunk, encoding, callback)
        }
      })

      return this
    }

    this.isRequestSent = true

    // Prevent handling this request if it has already been handled
    // in another (parent) interceptor (like XMLHttpRequest -> ClientRequest).
    // That means some interceptor up the chain has concluded that
    // this request must be performed as-is.
    if (this.getHeader('X-Request-Id') != null) {
      this.removeHeader('X-Request-Id')
      return this.passthrough(chunk, encoding, callback)
    }

    const { interactiveRequest, requestController } =
      this.createInteractiveRequest()

    // Execute the resolver Promise like a side-effect.
    // Node.js 16 forces "ClientRequest.end" to be synchronous and return "this".
    this.getMockResponse(interactiveRequest, requestController)
      .then((mockedResponse) => {
        /**
         * @fixme We are in the "end()" method that still executes in parallel
         * to our mocking logic here. This can be solved by migrating to the
         * Proxy-based approach and deferring the passthrough "end()" properly.
         * @see https://github.com/mswjs/interceptors/issues/346
         */
        if (!this.headersSent) {
          // Forward any request headers that the "request" listener
          // may have modified before proceeding with this request.
          for (const [headerName, headerValue] of interactiveRequest.headers) {
            this.setHeader(headerName, headerValue)
          }
        }

        if (mockedResponse) {
          this.logger.info(
            'received mocked response:',
            mockedResponse.status,
            mockedResponse.statusText
          )

          this.respondWith(mockedResponse)
          callback?.()

          return this
        }

        this.logger.info('no mocked response received!')
        this.forwardOriginalResponse()

        return this.passthrough(chunk, encoding, callback)
      })
      .catch((error) => this.errorWith(error))

    return this
  }

  flushHeaders(): void {
    this.isRequestSent = true

    // Prevent handling this request if it has already been handled
    // in another (parent) interceptor (like XMLHttpRequest -> ClientRequest).
    if (this.getHeader('X-Request-Id') != null) {
      this.removeHeader('X-Request-Id')
      return super.flushHeaders()
    }

    const { interactiveRequest, requestController } =
      this.createInteractiveRequest()

    this.responsePromise = this.getMockResponse(
      interactiveRequest,
      requestController
    )

    this.responsePromise
      .then((mockedResponse) => {
        if (mockedResponse) {
          this.respondWith(mockedResponse)
          return
        }

        // Forward the original response to the "response" listener.
        this.forwardOriginalResponse()
        super.flushHeaders()
      })
      .catch((error) => this.errorWith(error))
  }

  async getMockResponse(
    interactiveRequest: InteractiveRequest,
    requestController: RequestController
  ): Promise<Response | undefined> {
    // Add the last "request" listener that always resolves
    // the pending response Promise. This way if the consumer
    // hasn't handled the request themselves, we will prevent
    // the response Promise from pending indefinitely.
    this.emitter.once('request', ({ requestId: pendingRequestId }) => {
      // Ignore request events emitted by irrelevant
      // requests. This happens when response patching.
      if (pendingRequestId !== this.requestId) {
        return
      }

      if (requestController.responsePromise.state === 'pending') {
        this.logger.info(
          'request has not been handled in listeners, executing fail-safe listener...'
        )

        requestController.responsePromise.resolve(undefined)
      }
    })

    // Notify the interceptor about the request.
    // This will call any "request" listeners the users have.
    this.logger.info(
      'emitting the "request" event for %d listener(s)...',
      this.emitter.listenerCount('request')
    )

    await emitAsync(this.emitter, 'request', {
      request: interactiveRequest,
      requestId: this.requestId,
    })

    this.logger.info('all "request" listeners done!')

    const mockedResponse = await requestController.responsePromise
    this.logger.info('event.respondWith() called with:', mockedResponse)

    this.emit('mocked-response-lookup', mockedResponse)

    return mockedResponse
  }

  emit(event: string, ...data: any[]) {
    this.logger.info('emit: %s', event)

    if (event === 'response') {
      this.logger.info('found "response" event, cloning the response...')

      try {
        /**
         * Clone the response object when emitting the "response" event.
         * This prevents the response body stream from locking
         * and allows reading it twice:
         * 1. Internal "response" event from the observer.
         * 2. Any external response body listeners.
         * @see https://github.com/mswjs/interceptors/issues/161
         */
        const response = data[0] as IncomingMessage
        const firstClone = cloneIncomingMessage(response)
        const secondClone = cloneIncomingMessage(response)

        this.emit('response-internal', secondClone)

        this.logger.info(
          'response successfully cloned, emitting "response" event...'
        )
        return super.emit(event, firstClone, ...data.slice(1))
      } catch (error) {
        this.logger.info('error when cloning response:', error)
        return super.emit(event, ...data)
      }
    }

    if (event === 'error') {
      const error = data[0] as NodeJS.ErrnoException
      const errorCode = error.code || ''

      this.logger.info('error:\n', error)

      // Suppress certain errors while using the "mock" source.
      // For example, no need to destroy this request if it connects
      // to a non-existing hostname but has a mocked response.
      if (
        this.responseSource === 'mock' &&
        NodeClientRequest.suppressErrorCodes.includes(errorCode)
      ) {
        // Capture the first emitted error in order to replay
        // it later if this request won't have any mocked response.
        if (!this.capturedError) {
          this.capturedError = error
          this.logger.info('captured the first error:', this.capturedError)
        }
        return false
      }
    }

    return super.emit(event, ...data)
  }

  private forwardOriginalResponse(): void {
    this.logger.info('forwarding original response...')

    this.once('response-internal', (message: IncomingMessage) => {
      this.logger.info(message.statusCode, message.statusMessage)
      this.logger.info('original response headers:', message.headers)

      this.logger.info('emitting the custom "response" event...')
      this.emitter.emit('response', {
        request: this.request,
        requestId: this.requestId,
        response: createResponse(message),
        isMockedResponse: false,
      })
    })
  }

  /**
   * Performs the intercepted request as-is.
   * Replays the captured request body chunks,
   * still emits the internal events, and wraps
   * up the request with `super.end()`.
   */
  private passthrough(
    chunk: ClientRequestEndChunk | null,
    encoding?: BufferEncoding | null,
    callback?: ClientRequestEndCallback | null
  ): this {
    // Set the response source to "bypass".
    // Any errors emitted past this point are not suppressed.
    this.responseSource = 'bypass'

    // Propagate previously captured errors.
    // For example, a ECONNREFUSED error when connecting to a non-existing host.
    if (this.capturedError) {
      this.emit('error', this.capturedError)
      return this
    }

    this.logger.info('writing request chunks...', this.chunks)

    // Write the request body chunks in the order of ".write()" calls.
    // Note that no request body has been written prior to this point
    // in order to prevent the Socket to communicate with a potentially
    // existing server.
    for (const { chunk, encoding } of this.chunks) {
      if (encoding) {
        super.write(chunk, encoding)
      } else {
        super.write(chunk)
      }
    }

    this.once('error', (error) => {
      this.logger.info('original request error:', error)
    })

    this.once('abort', () => {
      this.logger.info('original request aborted!')
    })

    this.once('response-internal', (message: IncomingMessage) => {
      this.logger.info(message.statusCode, message.statusMessage)
      this.logger.info('original response headers:', message.headers)
    })

    this.logger.info('performing original request...')

    // This call signature is way too dynamic.
    return super.end(...[chunk, encoding as any, callback].filter(Boolean))
  }

  private createInteractiveRequest(): {
    interactiveRequest: InteractiveRequest
    requestController: RequestController
  } {
    this.fetchRequest = createRequest(this)
    const { interactiveRequest, requestController } = toInteractiveRequest(
      this.fetchRequest
    )

    /**
     * @todo Remove this modification of the original request
     * and expose the controller alongside it in the "request"
     * listener argument.
     */
    Object.defineProperty(this.fetchRequest, 'respondWith', {
      value: requestController.respondWith.bind(requestController),
    })

    return {
      interactiveRequest,
      requestController,
    }
  }

  /**
   * Responds to this request instance using a mocked response.
   */
  private respondWith(mockedResponse: Response): void {
    this.logger.info('responding with a mocked response...', mockedResponse)

    const responseClone = mockedResponse.clone()
    this.responseSource = 'mock'
    // Ignore this request being destroyed by TLS in Node.js
    // due to connection errors.
    this.destroyed = false

    // Handle mocked "Response.error" network error responses.
    if (mockedResponse.type === 'error') {
      this.logger.info('received network error response, aborting request...')

      // There is no standardized error format for network errors
      // in Node.js. Instead, emit a generic TypeError.
      this.emit('error', new TypeError('Network error'))
      this.terminate()
      return
    }

    /**
     * Mark the request as finished right before streaming back the response.
     * This is not entirely conventional but this will allow the consumer to
     * modify the outoging request in the interceptor.
     *
     * The request is finished when its headers and bodies have been sent.
     * @see https://nodejs.org/api/http.html#event-finish
     */
    Object.defineProperties(this, {
      writableFinished: { value: true },
      writableEnded: { value: true },
    })
    this.emit('finish')

    const { status, statusText, headers, body } = mockedResponse
    this.response.statusCode = status
    this.response.statusMessage = statusText

    if (headers) {
      this.response.headers = {}

      headers.forEach((headerValue, headerName) => {
        // Make sure that multi-value headers are appended correctly.
        this.response.rawHeaders.push(headerName, headerValue)

        const insensitiveHeaderName = headerName.toLowerCase()
        const prevHeaders = this.response.headers[insensitiveHeaderName]
        this.response.headers[insensitiveHeaderName] = prevHeaders
          ? Array.prototype.concat([], prevHeaders, headerValue)
          : headerValue
      })
    }
    this.logger.info('mocked response headers ready:', headers)

    /**
     * Set the internal "res" property to the mocked "OutgoingMessage"
     * to make the "ClientRequest" instance think there's data received
     * from the socket.
     * @see https://github.com/nodejs/node/blob/9c405f2591f5833d0247ed0fafdcd68c5b14ce7a/lib/_http_client.js#L501
     *
     * Set the response immediately so the interceptor could stream data
     * chunks to the request client as they come in.
     */
    // @ts-ignore
    this.res = this.response
    this.emit('response', this.response)

    const responseStreamPromise = new DeferredPromise<void>()

    const finishResponseStream = () => {
      this.logger.info('finished response stream!')

      // Push "null" to indicate that the response body is complete
      // and shouldn't be written to anymore.
      this.response.push(null)
      this.response.complete = true

      responseStreamPromise.resolve()
    }

    if (body) {
      const bodyReader = body.getReader()
      const readNextChunk = async (): Promise<void> => {
        const { done, value } = await bodyReader.read()

        if (done) {
          finishResponseStream()
          return
        }

        this.response.emit('data', value)

        return readNextChunk()
      }

      readNextChunk()
    } else {
      finishResponseStream()
    }

    responseStreamPromise.then(() => {
      this.logger.info('finalizing response...')
      this.response.emit('end')
      this.terminate()

      this.logger.info('emitting the custom "response" event...')

      this.emitter.emit('response', {
        request: this.request,
        requestId: this.requestId,
        response: responseClone,
        isMockedResponse: true,
      })

      this.logger.info(
        mockedResponse.status,
        mockedResponse.statusText,
        '(MOCKED)'
      )
      this.logger.info('request (mock) is completed')
    })
  }

  private errorWith(error: Error) {
    this.logger.info('called "errorWith", aborting request...', error)

    // Halt the request whenever the resolver throws an exception.
    this.destroyed = true
    this.emit('error', error)
    this.terminate()
  }

  /**
   * Terminates a pending request.
   */
  private terminate(): void {
    /**
     * @note Some request clients (e.g. Octokit) create a ClientRequest
     * in a way that it has no Agent set. Now, whether that's correct is
     * debatable, but we should still handle this case gracefully.
     * @see https://github.com/mswjs/interceptors/issues/304
     */
    // @ts-ignore
    this.agent?.destroy()
  }
}
