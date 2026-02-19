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
import { kClientSocket } from '../net/connection-controller'

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
          const requestParser = new HttpRequestParser({
            connectionOptions: {
              method: httpMethod,
              url: baseUrl,
            },
            onRequest: async (request) => {
              const requestId = createRequestId()

              const requestController = new RequestController(request, {
                respondWith: async (response) => {
                  connectionController.claim()

                  await this.respondWith({
                    socket: connectionController[kClientSocket],
                    request,
                    response,
                  })
                },
                errorWith: (reason) => {
                  if (reason instanceof Error) {
                    connectionController.errorWith(reason)
                  }
                },
                passthrough: () => {
                  const realSocket = connectionController.passthrough()

                  if (this.emitter.listenerCount('response') > 0) {
                    const responseParser = new HttpResponseParser({
                      onResponse: async (response) => {
                        await emitAsync(this.emitter, 'response', {
                          requestId,
                          request,
                          response,
                          isMockedResponse: false,
                        })
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
          socket.on('data', (chunk) => {
            if (chunk) {
              requestParser.execute(toBuffer(chunk))
            }
          })

          /** @todo Free the parser once the socket is destroyed  */
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

    const { STATUS_CODES } = await import('node:http')

    const statusText =
      response.statusText || STATUS_CODES[response.status] || ''
    const statusLine = `HTTP/1.1 ${response.status} ${statusText}\r\n`

    const rawResponseHeaders = getRawFetchHeaders(response.headers)

    let headersString = ''
    for (const [name, value] of rawResponseHeaders) {
      headersString += `${name}: ${value}\r\n`
    }

    headersString += '\r\n'

    /**
     * @note A hacky way to preserve the socket-parser association set
     * on the original socket. Creating `ServerResponse` rewrites that
     * association, resulting in the "socketOnData" callback failing the
     * socket identity check:
     * @see https://github.com/nodejs/node/blob/a73b575304722a3682fbec3a5fb13b39c5791342/lib/_http_client.js#L612
     * @see https://github.com/nodejs/node/blob/a73b575304722a3682fbec3a5fb13b39c5791342/lib/_http_server.js#L713
     */
    // @ts-expect-error Node.js internals
    socket.parser.socket = socket

    // Push the status line and headers to the readable stream
    socket.push(Buffer.from(statusLine + headersString))

    if (response.body) {
      try {
        const reader = response.body.getReader()

        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          socket.push(value)
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
    }

    socket.push(null)
  }
}
