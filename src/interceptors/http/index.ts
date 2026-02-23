import net from 'node:net'
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
import { kRawSocket } from '../net/mock-socket'
import { isModuleNamespaceObject } from 'node:util/types'

const log = createLogger('HttpRequestInterceptor')

export class HttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('client-request-interceptor')

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
      ({ connectionOptions, socket, controller: connectionController }) => {
        socket.once('data', (chunk) => {
          const firstFrame = chunk.toString()
          const httpMethod = firstFrame.split(' ')[0]

          invariant(
            httpMethod != null,
            'Failed to handle an HTTP request: expected a valid HTTP method but got "%s"',
            httpMethod
          )

          const baseUrl = connectionOptionsToUrl(connectionOptions)

          log('handling first frame...', { firstFrame, httpMethod, baseUrl })

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
                respondWith: (response) => {
                  log('respondWith() %o', {
                    status: response.status,
                    statusText: response.statusText,
                    hasBody: response.body != null,
                  })

                  connectionController.claim()

                  socket.once('connect', async () => {
                    await this.respondWith({
                      socket: connectionController[kRawSocket],
                      request,
                      response,
                    })
                  })

                  if (this.emitter.listenerCount('response') > 0) {
                    const responseClone = response.clone()

                    process.nextTick(async () => {
                      await emitAsync(this.emitter, 'response', {
                        requestId,
                        request,
                        response: responseClone,
                        isMockedResponse: true,
                      })
                    })
                  }
                },
                errorWith: (reason) => {
                  if (reason instanceof Error) {
                    connectionController.errorWith(reason)
                  }
                },
                passthrough: () => {
                  const realSocket = connectionController.passthrough()

                  if (this.emitter.listenerCount('response') > 0) {
                    const mockSocket = connectionController[kRawSocket]

                    // Pause the mock socket to prevent the passthrough 'data' listener
                    // from pushing data to it. The passthrough checks isPaused() and skips
                    // pushing when paused, allowing realSocket to continue emitting data
                    // for our response parser without backpressure issues.
                    mockSocket.pause()

                    const responseParser = new HttpResponseParser({
                      onResponse: async (response) => {
                        await emitAsync(this.emitter, 'response', {
                          requestId,
                          request,
                          response,
                          isMockedResponse: false,
                        })

                        mockSocket.resume()
                      },
                    })

                    realSocket
                      .on('data', (chunk) => responseParser.execute(chunk))
                      .on('close', () => responseParser.free())
                  }
                },
              })

              await handleRequest({
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
    const { socket, response } = args

    if (socket.destroyed) {
      return
    }

    if (isResponseError(response)) {
      socket.destroy(new TypeError('Network error'))
      return
    }

    invariant(
      !socket.connecting,
      'Failed to mock a response: socket has not connected'
    )

    const { STATUS_CODES } = await import('node:http')

    const statusText =
      response.statusText || STATUS_CODES[response.status] || ''
    const statusLine = `HTTP/1.1 ${response.status} ${statusText}\r\n`

    const rawResponseHeaders = getRawFetchHeaders(response.headers)
    const isChunkedEncoding =
      response.headers.get('transfer-encoding') === 'chunked'

    let headersString = ''
    for (const [name, value] of rawResponseHeaders) {
      headersString += `${name}: ${value}\r\n`
    }

    headersString += '\r\n'

    const httpMessageHeaders = statusLine + headersString
    log('writing http response message headers...\n', httpMessageHeaders)

    // Flush the mocked response headers.
    // This will trigger the "response" event in "ClientRequest".
    socket.push(Buffer.from(httpMessageHeaders))

    if (response.body) {
      try {
        const reader = response.body.getReader()

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          /**
           * Validate that the chunk is a valid type before pushing to the socket.
           * If it's not a Buffer, string, or TypedArray, socket.push() will emit
           * an async error event that bypasses our try/catch. We need to catch
           * this case and handle it synchronously.
           */
          if (
            value != null &&
            typeof value !== 'string' &&
            !Buffer.isBuffer(value) &&
            !(value instanceof Uint8Array) &&
            !ArrayBuffer.isView(value)
          ) {
            throw new Error('Invalid chunk type')
          }

          if (isChunkedEncoding) {
            const chunkSize = value.byteLength.toString(16)
            socket.push(Buffer.from(`${chunkSize}\r\n`))
            socket.push(value)
            socket.push(Buffer.from('\r\n'))
          } else {
            socket.push(value)
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          /**
           * Destroy the socket if the response stream errored.
           * @see https://github.com/mswjs/interceptors/issues/738
           */
          socket.destroy()
          return
        }
      }

      log('response stream handling done!')
    }

    if (isChunkedEncoding) {
      socket.push(Buffer.from('0\r\n\r\n'))
    }

    /**
     * @todo Keep-Alive requests shouldn't end the stream here.
     */
    socket.push(null)
  }
}
