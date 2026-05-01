import net from 'node:net'
import {
  METHODS,
  STATUS_CODES,
  ServerResponse,
  IncomingMessage,
} from 'node:http'
import { invariant } from 'outvariant'
import { Interceptor } from '../../Interceptor'
import { HttpResponseEvent, type HttpRequestEventMap } from '../../events/http'
import { RequestController } from '../../RequestController'
import {
  getRawFetchHeaders,
  recordRawFetchHeaders,
} from '../ClientRequest/utils/recordRawHeaders'
import { SocketInterceptor } from '../net'
import { connectionOptionsToUrl } from '../net/utils/connection-options-to-url'
import { toBuffer } from '../../utils/bufferUtils'
import { createRequestId } from '../../createRequestId'
import { HttpRequestParser, HttpResponseParser } from './http-parser'
import { handleRequest, HandleRequestOptions } from '../../utils/handleRequest'
import { isResponseError } from '../../utils/responseUtils'
import { createLogger } from '../../utils/logger'
import {
  kRawSocket,
  SocketController,
  type FlushPendingDataFunction,
} from '../net/socket-controller'
import { unwrapPendingData } from '../net/utils/flush-writes'
import { FetchResponse } from '../../utils/fetchUtils'
import { requestContext } from '../../request-context'

const log = createLogger('HttpRequestInterceptor')

export class HttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('http-request-interceptor')

  constructor() {
    super(HttpRequestInterceptor.symbol)
  }

  protected setup(): void {
    const socketInterceptor = new SocketInterceptor()
    socketInterceptor.apply()
    this.subscriptions.push(() => socketInterceptor.dispose())

    /**
     * @note Record the raw values provided to Headers set/append
     * in order to support "IncomingMessage.prototype.rawHeaders".
     * This is meant for the headers in mocked responses.
     */
    this.subscriptions.push(recordRawFetchHeaders())

    socketInterceptor.on(
      'connection',
      ({ connectionOptions, socket, controller: socketController }) => {
        /**
         * @note Only listen to the first sent packet.
         * A single socket cannot be used for different protocols.
         */
        socket.once('data', (chunk) => {
          const httpMessage = chunk.toString()
          const httpMethod = httpMessage.split(' ')[0] || ''

          // Ignore non-HTTP packets sent via this socket.
          if (!METHODS.includes(httpMethod.toUpperCase())) {
            return
          }

          const baseUrl = connectionOptionsToUrl(connectionOptions, socket)

          log('handling http message...', {
            httpMessage,
            httpMethod,
            baseUrl,
          })

          // Get the request initiator from the async context, if any.
          // Use the underlying socket as a fallback.
          const parentInitiator = requestContext.getStore()?.initiator
          const initiator = parentInitiator || socket

          const requestParser = new HttpRequestParser({
            connectionOptions: {
              method: httpMethod,
              url: baseUrl,
            },
            onRequest: async (request) => {
              const requestId = createRequestId()

              log('received a parsed HTTP request!', {
                method: request.method,
                url: request.url,
              })

              const requestController = new RequestController(request, {
                respondWith: async (rawResponse) => {
                  log('respondWith() %o', {
                    status: rawResponse.status,
                    statusText: rawResponse.statusText,
                    hasBody: rawResponse.body != null,
                  })

                  socketController.claim()

                  const response = FetchResponse.from(rawResponse, {
                    url: request.url,
                  })

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
                },
                errorWith: (reason) => {
                  if (reason instanceof Error) {
                    socket.destroy(reason)
                  }
                },
                passthrough: () => {
                  const realSocket = socketController.passthrough(
                    /**
                     * @todo Would be great NOT to run this if request headers weren't modified.
                     */
                    this.#modifyHttpHeaders(context.request)
                  )

                  if (this.emitter.listenerCount('response')) {
                    log('found "response" listener, pausing socket...')

                    const mockSocket = socketController[kRawSocket]

                    // Pause the mock socket to prevent the passthrough 'data' listener
                    // from pushing data to it. The passthrough checks isPaused() and skips
                    // pushing when paused, allowing realSocket to continue emitting data
                    // for our response parser without backpressure issues.
                    mockSocket.pause()

                    const responseParser = new HttpResponseParser({
                      onResponse: async (response) => {
                        log(
                          'http response parser parsed a response!',
                          response.status,
                          response.statusText
                        )

                        if (isResponseError(response)) {
                          log(
                            'response is an error response, resuming socket...'
                          )

                          mockSocket.resume()
                          return
                        }

                        FetchResponse.setUrl(request.url, response)

                        log('emitting "response" event...')
                        await this.emitter.emitAsPromise(
                          new HttpResponseEvent({
                            initiator,
                            requestId,
                            request: context.request,
                            response,
                            responseType: 'original',
                          })
                        )

                        log('resuming socket...')
                        mockSocket.resume()
                      },
                    })

                    realSocket
                      .on('data', (chunk) => responseParser.execute(chunk))
                      .on('close', () => responseParser.free())
                  }
                },
              })

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
              }

              await handleRequest(context)
            },
          })

          // Forward the first frame to the parser.
          requestParser.execute(toBuffer(chunk))

          // Forward subsequent socket writes to the parser.
          socket
            .on('data', (chunk) => {
              if (chunk) {
                requestParser.execute(toBuffer(chunk))
              }
            })
            .on('close', () => requestParser.free())
        })
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
      socket.destroy(new TypeError('Network error'))
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
    const serverResponse = new ServerResponse(new IncomingMessage(socket))

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
         * A resolved DeferredPromise continuation (from toWebResponse) is queued as
         * another microtask during the same phase. Since microtasks are drained before
         * nextTick, the test's `await` would resolve before the error event fires.
         * Using `queueMicrotask` ensures the error event is emitted within the current
         * microtask phase, before other queued microtasks.
         */
        queueMicrotask(() => this.emit('error', error))
        callback(null)
      } else {
        callback(null)
      }
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

    if (request.method !== 'CONNECT') {
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
      const httpMessageHeaders = FetchResponse.parseRawHeaders(
        httpMessageHeaderPairs.flatMap((header) => header.split(': '))
      )

      const rawHeaders = getRawFetchHeaders(request.headers)
      const visitedHeaders = new Set<string>()

      for (const [headerName] of rawHeaders) {
        const normalizedHeaderName = headerName.toLowerCase()

        if (visitedHeaders.has(normalizedHeaderName)) {
          continue
        }

        visitedHeaders.add(normalizedHeaderName)

        // Use the merged value from Headers to correctly handle
        // appended headers (e.g. "1, 2" instead of just "2").
        httpMessageHeaders.set(headerName, request.headers.get(headerName)!)
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
