import { ClientRequest, IncomingMessage, STATUS_CODES } from 'node:http'
import type { Logger } from '@open-draft/logger'
import { until } from '@open-draft/until'
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
import { toInteractiveRequest } from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'
import { getRawFetchHeaders } from '../../utils/getRawFetchHeaders'
import { isNodeLikeError } from '../../utils/isNodeLikeError'
import { INTERNAL_REQUEST_ID_HEADER_NAME } from '../../Interceptor'
import { createRequestId } from '../../createRequestId'
import {
  createServerErrorResponse,
  isResponseError,
} from '../../utils/responseUtils'

export type Protocol = 'http' | 'https'

enum HttpClientInternalState {
  // Have the concept of an idle request because different
  // request methods can kick off request sending
  // (e.g. ".end()" or ".flushHeaders()").
  Idle,
  Sending,
  Sent,
  MockLookupStart,
  MockLookupEnd,
  ResponseReceived,
}

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
    'ENETUNREACH',
    'EHOSTUNREACH',
  ]

  /**
   * Internal state of the request.
   */
  private state: HttpClientInternalState
  private responseType?: 'mock' | 'passthrough'
  private response: IncomingMessage
  private emitter: ClientRequestEmitter
  private logger: Logger
  private chunks: Array<{
    chunk?: string | Buffer
    encoding?: BufferEncoding
  }> = []
  private capturedError?: NodeJS.ErrnoException

  public url: URL
  public requestBuffer: Buffer | null

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

    this.state = HttpClientInternalState.Idle
    this.url = url
    this.emitter = options.emitter

    // Set request buffer to null by default so that GET/HEAD requests
    // without a body wouldn't suddenly get one.
    this.requestBuffer = null

    // Construct a mocked response message.
    this.response = new IncomingMessage(this.socket!)
  }

  private writeRequestBodyChunk(
    chunk: string | Buffer | null,
    encoding?: BufferEncoding
  ): void {
    if (chunk == null) {
      return
    }

    if (this.requestBuffer == null) {
      this.requestBuffer = Buffer.from([])
    }

    const resolvedChunk = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk, encoding)

    this.requestBuffer = Buffer.concat([this.requestBuffer, resolvedChunk])
  }

  write(...args: ClientRequestWriteArgs): boolean {
    const [chunk, encoding, callback] = normalizeClientRequestWriteArgs(args)
    this.logger.info('write:', { chunk, encoding, callback })
    this.chunks.push({ chunk, encoding })

    // Write each request body chunk to the internal buffer.
    this.writeRequestBodyChunk(chunk, encoding)

    this.logger.info(
      'chunk successfully stored!',
      this.requestBuffer?.byteLength
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

    const requestId = createRequestId()

    const [chunk, encoding, callback] = normalizeClientRequestEndArgs(...args)
    this.logger.info('normalized arguments:', { chunk, encoding, callback })

    // Write the last request body chunk passed to the "end()" method.
    this.writeRequestBodyChunk(chunk, encoding || undefined)

    /**
     * @note Mark the request as sent immediately when invoking ".end()".
     * In Node.js, calling ".end()" will flush the remaining request body
     * and mark the request as "finished" immediately ("end" is synchronous)
     * but we delegate that property update to:
     *
     * - respondWith(), in the case of mocked responses;
     * - super.end(), in the case of bypassed responses.
     *
     * For that reason, we have to keep an internal flag for a finished request.
     */
    this.state = HttpClientInternalState.Sent

    const capturedRequest = createRequest(this)
    const { interactiveRequest, requestController } =
      toInteractiveRequest(capturedRequest)

    /**
     * @todo Remove this modification of the original request
     * and expose the controller alongside it in the "request"
     * listener argument.
     */
    Object.defineProperty(capturedRequest, 'respondWith', {
      value: requestController.respondWith.bind(requestController),
    })

    // Prevent handling this request if it has already been handled
    // in another (parent) interceptor (like XMLHttpRequest -> ClientRequest).
    // That means some interceptor up the chain has concluded that
    // this request must be performed as-is.
    if (this.hasHeader(INTERNAL_REQUEST_ID_HEADER_NAME)) {
      this.removeHeader(INTERNAL_REQUEST_ID_HEADER_NAME)
      return this.passthrough(chunk, encoding, callback)
    }

    // Add the last "request" listener that always resolves
    // the pending response Promise. This way if the consumer
    // hasn't handled the request themselves, we will prevent
    // the response Promise from pending indefinitely.
    this.emitter.once('request', ({ requestId: pendingRequestId }) => {
      /**
       * @note Ignore request events emitted by irrelevant
       * requests. This happens when response patching.
       */
      if (pendingRequestId !== requestId) {
        return
      }

      if (requestController.responsePromise.state === 'pending') {
        this.logger.info(
          'request has not been handled in listeners, executing fail-safe listener...'
        )

        requestController.responsePromise.resolve(undefined)
      }
    })

    // Execute the resolver Promise like a side-effect.
    // Node.js 16 forces "ClientRequest.end" to be synchronous and return "this".
    until<unknown, Response | undefined>(async () => {
      // Notify the interceptor about the request.
      // This will call any "request" listeners the users have.
      this.logger.info(
        'emitting the "request" event for %d listener(s)...',
        this.emitter.listenerCount('request')
      )

      this.state = HttpClientInternalState.MockLookupStart

      await emitAsync(this.emitter, 'request', {
        request: interactiveRequest,
        requestId,
      })

      this.logger.info('all "request" listeners done!')

      const mockedResponse = await requestController.responsePromise
      this.logger.info('event.respondWith called with:', mockedResponse)

      return mockedResponse
    }).then((resolverResult) => {
      this.logger.info('the listeners promise awaited!')

      this.state = HttpClientInternalState.MockLookupEnd

      /**
       * @fixme We are in the "end()" method that still executes in parallel
       * to our mocking logic here. This can be solved by migrating to the
       * Proxy-based approach and deferring the passthrough "end()" properly.
       * @see https://github.com/mswjs/interceptors/issues/346
       */
      if (!this.headersSent) {
        // Forward any request headers that the "request" listener
        // may have modified before proceeding with this request.
        for (const [headerName, headerValue] of capturedRequest.headers) {
          this.setHeader(headerName, headerValue)
        }
      }

      if (resolverResult.error) {
        this.logger.info(
          'unhandled resolver exception, coercing to an error response...',
          resolverResult.error
        )

        // Handle thrown Response instances.
        if (resolverResult.error instanceof Response) {
          // Treat thrown Response.error() as a request error.
          if (isResponseError(resolverResult.error)) {
            this.logger.info(
              'received network error response, erroring request...'
            )

            this.errorWith(new TypeError('Network error'))
          } else {
            // Handle a thrown Response as a mocked response.
            this.respondWith(resolverResult.error)
          }

          return
        }

        // Allow throwing Node.js-like errors, like connection rejection errors.
        // Treat them as request errors.
        if (isNodeLikeError(resolverResult.error)) {
          this.errorWith(resolverResult.error)
          return this
        }

        until(async () => {
          if (this.emitter.listenerCount('unhandledException') > 0) {
            // Emit the "unhandledException" event to allow the client
            // to opt-out from the default handling of exceptions
            // as 500 error responses.
            await emitAsync(this.emitter, 'unhandledException', {
              error: resolverResult.error,
              request: capturedRequest,
              requestId,
              controller: {
                respondWith: this.respondWith.bind(this),
                errorWith: this.errorWith.bind(this),
              },
            })

            // If after the "unhandledException" listeners are done,
            // the request is either not writable (was mocked) or
            // destroyed (has errored), do nothing.
            if (this.writableEnded || this.destroyed) {
              return
            }
          }

          // Unhandled exceptions in the request listeners are
          // synonymous to unhandled exceptions on the server.
          // Those are represented as 500 error responses.
          this.respondWith(createServerErrorResponse(resolverResult.error))
        })

        return this
      }

      const mockedResponse = resolverResult.data

      if (mockedResponse) {
        this.logger.info(
          'received mocked response:',
          mockedResponse.status,
          mockedResponse.statusText
        )

        /**
         * @note Ignore this request being destroyed by TLS in Node.js
         * due to connection errors.
         */
        this.destroyed = false

        // Handle mocked "Response.error" network error responses.
        if (isResponseError(mockedResponse)) {
          this.logger.info(
            'received network error response, erroring request...'
          )

          /**
           * There is no standardized error format for network errors
           * in Node.js. Instead, emit a generic TypeError.
           */
          this.errorWith(new TypeError('Network error'))

          return this
        }

        const responseClone = mockedResponse.clone()

        this.respondWith(mockedResponse)
        this.logger.info(
          mockedResponse.status,
          mockedResponse.statusText,
          '(MOCKED)'
        )

        callback?.()

        this.logger.info('emitting the custom "response" event...')
        this.emitter.emit('response', {
          response: responseClone,
          isMockedResponse: true,
          request: capturedRequest,
          requestId,
        })

        this.logger.info('request (mock) is completed')

        return this
      }

      this.logger.info('no mocked response received!')

      this.once('response-internal', (message: IncomingMessage) => {
        this.logger.info(message.statusCode, message.statusMessage)
        this.logger.info('original response headers:', message.headers)

        this.logger.info('emitting the custom "response" event...')
        this.emitter.emit('response', {
          response: createResponse(message),
          isMockedResponse: false,
          request: capturedRequest,
          requestId,
        })
      })

      return this.passthrough(chunk, encoding, callback)
    })

    return this
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

      // Suppress only specific Node.js connection errors.
      if (NodeClientRequest.suppressErrorCodes.includes(errorCode)) {
        // Until we aren't sure whether the request will be
        // passthrough, capture the first emitted connection
        // error in case we have to replay it for this request.
        if (this.state < HttpClientInternalState.MockLookupEnd) {
          if (!this.capturedError) {
            this.capturedError = error
            this.logger.info('captured the first error:', this.capturedError)
          }
          return false
        }

        // Ignore any connection errors once we know the request
        // has been resolved with a mocked response. Don't capture
        // them as they won't ever be replayed.
        if (
          this.state === HttpClientInternalState.ResponseReceived &&
          this.responseType === 'mock'
        ) {
          return false
        }
      }
    }

    return super.emit(event, ...data)
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
    this.state = HttpClientInternalState.ResponseReceived
    this.responseType = 'passthrough'

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

  /**
   * Responds to this request instance using a mocked response.
   */
  private respondWith(mockedResponse: Response): void {
    this.logger.info('responding with a mocked response...', mockedResponse)

    this.state = HttpClientInternalState.ResponseReceived
    this.responseType = 'mock'

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
    this.response.statusMessage = statusText || STATUS_CODES[status]

    // Try extracting the raw headers from the headers instance.
    // If not possible, fallback to the headers instance as-is.
    const rawHeaders = getRawFetchHeaders(headers) || headers

    if (rawHeaders) {
      this.response.headers = {}

      rawHeaders.forEach((headerValue, headerName) => {
        /**
         * @note Make sure that multi-value headers are appended correctly.
         */
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

    const isResponseStreamFinished = new DeferredPromise<void>()

    const finishResponseStream = () => {
      this.logger.info('finished response stream!')

      // Push "null" to indicate that the response body is complete
      // and shouldn't be written to anymore.
      this.response.push(null)
      this.response.complete = true

      isResponseStreamFinished.resolve()
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

    isResponseStreamFinished.then(() => {
      this.logger.info('finalizing response...')
      this.response.emit('end')
      this.terminate()

      this.logger.info('request complete!')
    })
  }

  private errorWith(error: Error): void {
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
