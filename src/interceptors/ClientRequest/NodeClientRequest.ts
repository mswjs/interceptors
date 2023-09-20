import { ClientRequest, IncomingMessage } from 'http'
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
import { uuidv4 } from '../../utils/uuid'
import { emitAsync } from '../../utils/emitAsync'

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

  private response: IncomingMessage
  private emitter: ClientRequestEmitter
  private logger: Logger
  private chunks: Array<{
    chunk?: string | Buffer
    encoding?: BufferEncoding
  }> = []
  private responseSource: 'mock' | 'bypass' = 'mock'
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

    const requestId = uuidv4()

    const [chunk, encoding, callback] = normalizeClientRequestEndArgs(...args)
    this.logger.info('normalized arguments:', { chunk, encoding, callback })

    // Write the last request body chunk passed to the "end()" method.
    this.writeRequestBodyChunk(chunk, encoding || undefined)

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
    if (this.getHeader('X-Request-Id') != null) {
      this.removeHeader('X-Request-Id')
      return this.passthrough(chunk, encoding, callback)
    }

    // Notify the interceptor about the request.
    // This will call any "request" listeners the users have.
    this.logger.info(
      'emitting the "request" event for %d listener(s)...',
      this.emitter.listenerCount('request')
    )

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
        requestController.responsePromise.resolve(undefined)
      }
    })

    // Execute the resolver Promise like a side-effect.
    // Node.js 16 forces "ClientRequest.end" to be synchronous and return "this".
    until(async () => {
      await emitAsync(this.emitter, 'request', {
        request: interactiveRequest,
        requestId,
      })

      const mockedResponse = await requestController.responsePromise
      this.logger.info('event.respondWith called with:', mockedResponse)

      return mockedResponse
    }).then((resolverResult) => {
      this.logger.info('the listeners promise awaited!')

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

      // Halt the request whenever the resolver throws an exception.
      if (resolverResult.error) {
        this.logger.info(
          'encountered resolver exception, aborting request...',
          resolverResult.error
        )
        this.emit('error', resolverResult.error)
        this.terminate()

        return this
      }

      const mockedResponse = resolverResult.data

      if (mockedResponse) {
        this.logger.info('received mocked response:', mockedResponse)

        // Handle mocked "Response.error" network error responses.
        if (mockedResponse.type === 'error') {
          this.logger.info(
            'received network error response, aborting request...'
          )

          /**
           * There is no standardized error format for network errors
           * in Node.js. Instead, emit a generic TypeError.
           */
          this.emit('error', new TypeError('Network error'))
          this.terminate()

          return this
        }

        const responseClone = mockedResponse.clone()

        this.responseSource = 'mock'

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

  /**
   * Responds to this request instance using a mocked response.
   */
  private respondWith(mockedResponse: Response): void {
    this.logger.info('responding with a mocked response...', mockedResponse)

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

    const isResponseStreamFinished = new DeferredPromise<void>()

    const finishResponseStream = () => {
      this.logger.info('finished response stream!')
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

    isResponseStreamFinished.then(() => {
      this.logger.info('finalizing response...')

      // Push "null" to indicate that the response body is complete
      // and shouldn't be written to anymore.
      this.response.push(null)
      this.response.complete = true
      this.response.emit('end')

      this.terminate()
    })
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
