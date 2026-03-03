import net from 'node:net'
import { Readable } from 'node:stream'
import {
  METHODS,
  STATUS_CODES,
  ServerResponse,
  IncomingMessage,
} from 'node:http'
import type { ReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { invariant } from 'outvariant'
import { Interceptor } from '../../Interceptor'
import { type HttpRequestEventMap } from '../../glossary'
import { RequestController } from '../../RequestController'
import {
  getRawFetchHeaders,
  recordRawFetchHeaders,
  restoreHeadersPrototype,
} from '../ClientRequest/utils/recordRawHeaders'
import { SocketInterceptor } from '../net'
import { connectionOptionsToUrl } from '../net/utils/connection-options-to-url'
import { toBuffer } from '../../utils/bufferUtils'
import { createRequestId } from '../../createRequestId'
import { HttpRequestParser, HttpResponseParser } from './http-parser'
import { emitAsync } from '../../utils/emitAsync'
import { handleRequest } from '../../utils/handleRequest'
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

    recordRawFetchHeaders()
    this.subscriptions.push(() => restoreHeadersPrototype())

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

                  const respond = () => {
                    return this.respondWith({
                      socket: socketController[kRawSocket],
                      request,
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

                  if (
                    this.emitter.listenerCount('response') > 0 &&
                    /**
                     * @note The "response" event is designed to observe responses.
                     * While a mocked "Response.error()" is, technically, a response,
                     * it must not emit the "response" event as it's treated as a request error.
                     */
                    !isResponseError(response)
                  ) {
                    const responseClone = response.clone()

                    await emitAsync(this.emitter, 'response', {
                      initiator,
                      requestId,
                      request,
                      response: responseClone,
                      isMockedResponse: true,
                    })
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
                    this.#modifyHttpHeaders(request)
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
                        await emitAsync(this.emitter, 'response', {
                          initiator,
                          requestId,
                          request,
                          response,
                          isMockedResponse: false,
                        })

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

              await handleRequest({
                initiator,
                request,
                requestId,
                controller: requestController,
                emitter: this.emitter,
              })
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

    responseSocket._destroy = () => {
      /**
       * Destroy the socket if the response stream errored.
       * @see https://github.com/mswjs/interceptors/issues/738
       *
       * Response errors destroy the socket gracefully (no error).
       * Instead, the "error" event is emitted with a more detailed error.
       * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/_http_client.js#L586
       */
      socket.destroy()
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

    if (response.body) {
      await pipeline(
        Readable.fromWeb(response.body as ReadableStream),
        serverResponse
      )
    } else {
      serverResponse.end()
    }

    if (request.method !== 'CONNECT') {
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

      for (const [name, value] of rawHeaders) {
        httpMessageHeaders.set(name, value)
      }

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
