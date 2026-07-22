import net from 'node:net'
import {
  METHODS,
  STATUS_CODES,
  ServerResponse,
  IncomingMessage,
} from 'node:http'
import { invariant } from 'outvariant'
import { HttpResponseEvent, type HttpRequestEventMap } from '../../events/http'
import { RequestController } from '../../RequestController'
import {
  getRawFetchHeaders,
  recordRawFetchHeaders,
} from '../ClientRequest/utils/record-raw-headers'
import { SocketInterceptor } from '../net'
import { connectionOptionsToUrl } from '../net/utils/connection-options-to-url'
import { toBuffer } from '../../utils/bufferUtils'
import { createRequestId } from '../../createRequestId'
import { HttpRequestParser, HttpResponseParser } from './http-parser'
import { handleRequest, HandleRequestOptions } from '../../utils/handleRequest'
import { isResponseError, kErrorResponse } from '../../utils/responseUtils'
import { createLogger } from '../../utils/logger'
import {
  kRawSocket,
  SocketController,
  type FlushPendingDataFunction,
} from '../net/socket-controller'
import { unwrapPendingData } from '../net/utils/flush-writes'
import { FetchResponse } from '../../utils/fetchUtils'
import { requestContext } from '../../request-context'
import { Interceptor } from '#/src/interceptor'

const httpLogger = createLogger('http-request')

/**
 * Interceptor for HTTP requests in Node.js.
 * Routes socket connections through an HTTP parser.
 */
export class NodeHttpRequestSource extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('node-http-request-source')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    const socketInterceptor = Interceptor.singleton(SocketInterceptor)
    socketInterceptor.apply(this)
    this.subscriptions.push(() => {
      socketInterceptor.dispose(this)
    })

    /**
     * @note Record the raw values provided to Headers set/append
     * in order to support "IncomingMessage.prototype.rawHeaders".
     * This is meant for the headers in mocked responses.
     */
    this.subscriptions.push(recordRawFetchHeaders())

    const controller = new AbortController()
    this.subscriptions.push(() => controller.abort())

    socketInterceptor.on(
      'connection',
      ({ connectionOptions, socket, controller: socketController }) => {
        let isHttpConnection: boolean | undefined
        let requestParser: HttpRequestParser | undefined
        let tunnelUrl: URL | undefined
        let abortPendingRequest: (() => void) | undefined

        /**
         * @note Capture the request context of the connection itself.
         * The socket is created synchronously within the request async
         * context (e.g. inside the patched `http.request()`), but the
         * first data may reach the socket from a foreign context (e.g.
         * a form-data stream piped into the request), where sampling
         * the request context yields nothing.
         */
        const connectionRequestContext = requestContext.getStore()

        /**
         * @note The client destroys the socket synchronously (e.g. Undici
         * on request abort) but the socket teardown events ("error",
         * "close") are emitted asynchronously, after the consumer has
         * already observed the rejected request promise. Hook into the
         * destroy itself so the pending request is aborted before any
         * of its listeners can resume.
         */
        const rawSocket = socketController[kRawSocket]
        const realSocketDestroy = rawSocket._destroy.bind(rawSocket)
        rawSocket._destroy = (error, callback) => {
          abortPendingRequest?.()
          realSocketDestroy(error, callback)
        }

        /**
         * @note Only inspect the first sent packet to determine the protocol.
         * A single socket cannot be used for different protocols.
         */
        socket.on('data', (chunk) => {
          if (isHttpConnection === false) {
            return
          }

          /**
           * @note A mocked "CONNECT" request has established a tunnel.
           * The data that follows belongs to a new exchange addressed to
           * the tunnel target. The parser stopped at the tunnel boundary
           * (HTTP upgrade semantics), so tear it down and detect the
           * tunneled protocol anew, like on a fresh connection.
           */
          if (tunnelUrl && requestParser) {
            requestParser.free()
            requestParser = undefined
            isHttpConnection = undefined
            socketController.reset()
          }

          if (requestParser) {
            requestParser.execute(toBuffer(chunk))
            return
          }

          const httpMessage = chunk.toString()
          const httpMethod = httpMessage.split(' ')[0] || ''

          // Ignore non-HTTP packets sent via this socket.
          if (!METHODS.includes(httpMethod.toUpperCase())) {
            isHttpConnection = false
            return
          }

          isHttpConnection = true

          const baseUrl =
            tunnelUrl ?? connectionOptionsToUrl(connectionOptions, socket)

          httpLogger.verbose('handling http message %o', {
            httpMessage,
            httpMethod,
            baseUrl,
          })

          // Get the request initiator from the async context, falling
          // back to the context captured at the connection time, then
          // to the underlying socket.
          const requestContextValue =
            requestContext.getStore() ?? connectionRequestContext
          const initiator = requestContextValue?.initiator || socket

          requestParser = new HttpRequestParser({
            connectionOptions: {
              method: httpMethod,
              url: baseUrl,
            },
            onRequest: async (parsedRequest, requestAbortController) => {
              const request =
                requestContextValue?.transformRequest?.(parsedRequest) ??
                parsedRequest

              /**
               * @note A subsequent request arriving on a kept-alive socket
               * that has already been handled (passed through or mocked).
               * Clients like Undici reuse sockets without emitting the
               * "free" event, so reset the controller here, at the HTTP
               * message boundary, to handle the new request from the
               * pending state again.
               */
              if (socketController['readyState'] !== SocketController.PENDING) {
                socketController.reset()
              }

              const requestId = createRequestId()
              const requestLogger = requestContextValue?.logger ?? httpLogger

              httpLogger.verbose('received a parsed HTTP request %o', {
                method: request.method,
                url: request.url,
              })

              const requestController = new RequestController(
                request,
                {
                  respondWith: async (rawResponse) => {
                    httpLogger.verbose('respondWith() %o', {
                      status: rawResponse.status,
                      statusText: rawResponse.statusText,
                      hasBody: rawResponse.body != null,
                    })

                    /**
                     * @note The client may destroy the socket (e.g. on request
                     * abort) moments before a response arrives. A destroyed
                     * socket cannot be claimed and has no one reading it.
                     */
                    if (socket.destroyed) {
                      return
                    }

                    socketController.claim()

                    const response = FetchResponse.from(rawResponse, {
                      url: request.url,
                    })

                    /**
                     * @note A successful mocked response to a "CONNECT"
                     * request establishes a tunnel to the requested authority
                     * (e.g. "127.0.0.1:80"). The exchange that follows on this
                     * socket is addressed to that authority, not to the proxy.
                     */
                    if (request.method === 'CONNECT' && response.ok) {
                      tunnelUrl = new URL(`http://${request.url}`)
                    }

                    /**
                     * @note Clone the response before "respondWith" because it will
                     * consume its body. This way, we can have a readable response copy
                     * for the "response" event below.
                     */
                    const responseClone = isResponseError(response)
                      ? null
                      : response.clone()

                    const respond = () => {
                      return this.respondWith({
                        socket: socketController[kRawSocket],
                        request: context.request,
                        response,
                      })
                    }

                    if (responseClone) {
                      await this.emitter.emitAsPromise(
                        new HttpResponseEvent({
                          initiator,
                          requestId,
                          request: context.request,
                          response: responseClone,
                          responseType: 'mock',
                        })
                      )
                    }

                    if (socket.connecting) {
                      // Send a mocked response once the socket connects, just like the real server would.
                      // This preserves the correct order of events (e.g. connect, then data).
                      socket.once('connect', respond)
                    } else {
                      /**
                       * @note Reused sockets stay connected between requests and will not
                       * emit "connect" anymore. If that's the case, respond immediately.
                       */
                      await respond()
                    }
                  },
                  errorWith: (reason) => {
                    if (reason instanceof Error) {
                      socket.destroy(reason)
                    }
                  },
                  passthrough: () => {
                    const realSocket = socketController.passthrough(
                      this.#modifyHttpHeaders(context.request)
                    )

                    if (this.emitter.listenerCount('response') > 0) {
                      httpLogger.verbose(
                        'found "response" listener, corking socket reads'
                      )

                      /**
                       * Suspend the delivery of the original response to the client
                       * until the "response" event listeners settle. This guarantees
                       * that the request promise (e.g. `await fetch()`) does not
                       * resolve before the listeners are done. The real socket keeps
                       * emitting data for the response parser meanwhile.
                       */
                      socketController.corkReads()

                      const responseParser = new HttpResponseParser({
                        onResponse: async (response) => {
                          httpLogger.verbose(
                            'HTTP response parser parsed: %d %s',
                            response.status,
                            response.statusText
                          )

                          if (isResponseError(response)) {
                            httpLogger.verbose(
                              'response is an error response, uncorking socket reads...'
                            )

                            socketController.uncorkReads()
                            return
                          }

                          FetchResponse.setUrl(request.url, response)

                          try {
                            httpLogger.verbose('emitting "response" event')
                            await this.emitter.emitAsPromise(
                              new HttpResponseEvent({
                                initiator,
                                requestId,
                                request: context.request,
                                response,
                                responseType: 'original',
                              })
                            )
                          } finally {
                            httpLogger.verbose('uncorking socket reads')
                            socketController.uncorkReads()

                            /**
                             * @note Informational responses other than
                             * "101 Switching Protocols" are followed by a final
                             * response on the same connection. Keep gating that
                             * final response on the "response" event listeners.
                             */
                            if (
                              response.status < 200 &&
                              response.status !== 101
                            ) {
                              socketController.corkReads()
                            }
                          }
                        },
                      })

                      realSocket
                        .on('data', (chunk) => responseParser.execute(chunk))
                        .on('close', () => responseParser.free())
                    }
                  },
                },
                {
                  logger: requestLogger,
                  requestId,
                }
              )

              invariant(
                socketController['readyState'] === SocketController.PENDING,
                'CANNOT HANDLE ALREADY HANDLED REQUEST',
                request.method,
                request.url,
                socketController['readyState']
              )

              /**
               * @note Create a request resolution context.
               * This is so modifications to the "request" in upstream interceptors
               * are correctly picked up by the underlying HTTP interceptor.
               */
              const context: HandleRequestOptions = {
                initiator,
                requestId,
                request,
                controller: requestController,
                emitter: this.emitter,
                logger: requestLogger,
              }

              /**
               * @note The client destroying the socket while the request
               * is still pending means the request was aborted (e.g. via
               * `AbortController`). Abort the parsed request so its
               * handling settles and late interactions with the request
               * controller become controlled errors.
               */
              abortPendingRequest = () => {
                if (
                  requestController.readyState === RequestController.PENDING
                ) {
                  requestAbortController.abort()
                }
              }

              try {
                await handleRequest(context)
              } finally {
                abortPendingRequest = undefined
              }
            },
          })

          // Forward the first frame to the parser.
          requestParser.execute(toBuffer(chunk))
        })

        socket.on('close', () => requestParser?.free())
      },
      {
        signal: controller.signal,
      }
    )
  }

  private async respondWith(args: {
    socket: net.Socket
    request: Request
    response: Response
  }): Promise<void> {
    const { socket, request, response } = args

    if (socket.destroyed) {
      return
    }

    if (isResponseError(response)) {
      /**
       * @note Reference the error response on the socket error so the
       * client-side interceptors (e.g. fetch) can surface it to the
       * consumer as the reason behind the failed request. Keep the
       * reference non-enumerable so the error remains observably
       * identical for the clients that expose it as-is.
       */
      socket.destroy(
        Object.defineProperty(new TypeError('Network error'), kErrorResponse, {
          value: response,
          enumerable: false,
        })
      )
      return
    }

    invariant(
      !socket.connecting,
      'Failed to mock a response for "%s %s": socket has not connected',
      request.method,
      request.url
    )

    /**
     * Use native server response handling in Node.js.
     * @see https://github.com/nodejs/node/blob/13eb80f3b718452213e0fc449702aefbbfe4110f/lib/_http_server.js#L202
     */
    const incomingMessage = new IncomingMessage(socket)

    /**
     * @note Describe the request method so the response body is
     * handled appropriately (e.g. "HEAD" responses must not write
     * a body). The HTTP version is deliberately left unset: with it,
     * `ServerResponse` frames bodies of unknown length as chunked,
     * polluting the mocked response headers with "Transfer-Encoding"
     * the mock never specified.
     */
    incomingMessage.method = request.method

    const serverResponse = new ServerResponse(incomingMessage)

    const responseSocket = new net.Socket()

    responseSocket._writeGeneric = (writev, data, encoding, callback) => {
      unwrapPendingData(data, (chunk, encoding) => {
        socket.push(toBuffer(chunk), encoding)
      })
      callback?.()
    }

    responseSocket._destroy = (
      error: Error | null,
      callback: (error: Error | null) => void
    ) => {
      /**
       * Only destroy the socket on stream errors.
       * On a clean end, the socket is already signaled via `socket.push(null)`
       * in the main response flow. Destroying it here prematurely would prevent
       * the client from processing the response (e.g. calling `response.destroy()`).
       * @see https://github.com/mswjs/interceptors/issues/738
       */
      if (error) {
        socket.destroy()
      }

      callback(null)
    }

    responseSocket.on('drain', () => serverResponse.emit('drain'))
    serverResponse.assignSocket(responseSocket)

    serverResponse.removeHeader('connection')
    serverResponse.removeHeader('date')

    const rawResponseHeaders = getRawFetchHeaders(response.headers)
    serverResponse.writeHead(
      response.status,
      response.statusText || STATUS_CODES[response.status],
      rawResponseHeaders
    )

    /**
     * @note Override the socket's `_destroy` before writing the response body.
     * The underlying TCP handle (from `socket.connect()`) makes `_destroy` async
     * (`_handle.close()` callback), which delays the 'error' event. Since the real
     * TCP connection is irrelevant for mocked responses, take the synchronous path
     * so that user-initiated `response.destroy(error)` emits the error promptly.
     * This must happen before `serverResponse.end()` because the HTTP parser may
     * fire the 'response' event synchronously during `socket.push()`.
     */
    socket._destroy = function (
      error: Error | null,
      callback: (error: Error | null) => void
    ) {
      if (error) {
        /**
         * Emit the error event as a microtask instead of relying on the default
         * `process.nextTick(emitErrorNT)` from `callback(error)`. This is necessary
         * because `respondWith` runs inside a microtask (from `await reader.read()`).
         * A resolved promise continuation (from toWebResponse) is queued as
         * another microtask during the same phase. Since microtasks are drained before
         * nextTick, the test's `await` would resolve before the error event fires.
         * Using `queueMicrotask` ensures the error event is emitted within the current
         * microtask phase, before other queued microtasks.
         */
        queueMicrotask(() => this.emit('error', error))
      }

      callback(null)

      /**
       * @note `net.Socket` is constructed with `emitClose: false`, so Node's
       * stream destroy machinery does not emit `'close'` automatically; the
       * stock `net.Socket._destroy` only emits it via `_handle.close()`.
       * Since this override replaces `_destroy`, emit `'close'` here so the
       * mocked socket completes its lifecycle (otherwise consumers waiting
       * on `'close'`, like `http.ClientRequest`, hang).
       */
      process.nextTick(() => this.emit('close', error != null))
    }

    if (response.body) {
      const reader = response.body.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            serverResponse.end()
            break
          }

          if (!serverResponse.write(value)) {
            await new Promise<void>((resolve) => {
              serverResponse.once('drain', resolve)
            })
          }
        }
      } catch {
        /**
         * @note Delay the socket destruction to allow the event loop
         * to flush already-pushed response data (headers + body chunks)
         * through the HTTP parser. Without this, the socket is destroyed
         * on the same tick as `socket.push(data)` and the client never
         * reads the response.
         */
        await new Promise<void>((resolve) => process.nextTick(resolve))
        socket.destroy()
        return
      }
    } else {
      serverResponse.end()
    }

    /**
     * @note Self-delimiting responses (chunked, explicit "Content-Length",
     * or bodiless by definition) must NOT signal the end-of-stream.
     * The client parser completes them from their framing alone, and
     * ending the socket would kill the kept-alive connection that
     * agents pool and reuse for subsequent requests.
     */
    const isSelfDelimitingResponse =
      request.method === 'HEAD' ||
      response.headers.has('content-length') ||
      response.headers.has('transfer-encoding') ||
      !FetchResponse.isResponseWithBody(response.status)

    if (request.method !== 'CONNECT' && !isSelfDelimitingResponse) {
      /**
       * @note Defer the end-of-stream signal so the HTTP parser has a chance
       * to process already-pushed response data and fire the 'response' event
       * before the socket is ended. Without this, the parser marks the response
       * as "complete" before the client can interact with it (e.g. `response.destroy()`).
       */
      await new Promise<void>((resolve) => process.nextTick(resolve))
      socket.push(null)
    }
  }

  #modifyHttpHeaders(request: Request): FlushPendingDataFunction {
    const transformRequestMessage = (
      httpMessage: string | Buffer,
      encoding?: BufferEncoding | 'buffer'
    ): string | Buffer => {
      /**
       * @note Socket can write a buffer (e.g. uploaded file) even before
       * it writes the HTTP message. Bypass those cases.
       */
      if (encoding === 'buffer') {
        return httpMessage
      }

      const parts = httpMessage.toString(encoding).split('\r\n')
      const headersEndIndex = parts.findIndex((field) => field === '')
      const httpMessageHeaderPairs = parts.slice(1, headersEndIndex)

      // Extract raw [name, value] tuples from the wire format so they
      // can be compared against the request's raw fetch headers.
      const httpMessageRawHeaders = httpMessageHeaderPairs.map(
        (line): [string, string] => {
          const separatorIndex = line.indexOf(': ')
          return [line.slice(0, separatorIndex), line.slice(separatorIndex + 2)]
        }
      )

      const requestRawHeaders = getRawFetchHeaders(request.headers)

      // If the raw headers from the outgoing HTTP message and the request
      // headers are identical, send the message as-is to avoid the cost
      // (and side effects) of reserializing the headers block.
      const headersUnchanged =
        httpMessageRawHeaders.length === requestRawHeaders.length &&
        httpMessageRawHeaders.every((tuple, index) => {
          const requestTuple = requestRawHeaders[index]
          return tuple[0] === requestTuple[0] && tuple[1] === requestTuple[1]
        })

      if (headersUnchanged) {
        return httpMessage
      }

      const httpMessageHeaders = FetchResponse.parseRawHeaders(
        httpMessageHeaderPairs.flatMap((header) => header.split(': '))
      )

      const visitedHeaders = new Set<string>()

      for (const [headerName] of requestRawHeaders) {
        const normalizedHeaderName = headerName.toLowerCase()

        if (visitedHeaders.has(normalizedHeaderName)) {
          continue
        }

        visitedHeaders.add(normalizedHeaderName)

        /**
         * @note Forbidden Fetch headers (e.g. Host, Origin, Connection)
         * are stripped from `request.headers` but remain in the raw
         * headers list. Skip them so the original values from the
         * outgoing HTTP message are preserved.
         */
        const headerValue = request.headers.get(headerName)
        if (headerValue === null) {
          continue
        }

        // Use the merged value from Headers to correctly handle
        // appended headers (e.g. "1, 2" instead of just "2").
        httpMessageHeaders.set(headerName, headerValue)
      }

      visitedHeaders.clear()

      const httpMessageHeadersString = Array.from(httpMessageHeaders)
        .map(([name, value]) => `${name}: ${value}`)
        .join('\r\n')
      parts.splice(1, headersEndIndex - 1, httpMessageHeadersString)

      return parts.join('\r\n')
    }

    return (pendingData, encoding, callback) => {
      if (Array.isArray(pendingData)) {
        pendingData[0].chunk = transformRequestMessage(
          pendingData[0].chunk,
          pendingData[0].encoding
        )
      } else {
        pendingData = transformRequestMessage(pendingData, encoding)
      }

      callback(pendingData)
    }
  }
}
