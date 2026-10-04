import net from 'node:net'
import http2 from 'node:http2'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Duplex, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Interceptor } from '#/src/interceptor'
import { HttpResponseEvent, type HttpRequestEventMap } from '#/src/events/http'
import { RequestController } from '#/src/request-controller'
import { createRequestId } from '#/src/create-request-id'
import {
  handleRequest,
  type HandleRequestOptions,
} from '#/src/utils/handle-request'
import { cloneResponse } from '#/src/utils/clone-response'
import { FetchRequest, FetchResponse } from '#/src/utils/fetch-utils'
import { patchesRegistry } from '#/src/utils/patches-registry'
import { isResponseError } from '#/src/utils/response-utils'
import { SocketInterceptor } from '../net'
import {
  kRawSocket,
  SocketController,
  TlsSocketController,
} from '../net/socket-controller'
import { connectionOptionsToUrl } from '../net/utils/connection-options-to-url'

const HTTP2_CONNECTION_PREFACE = Buffer.from('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n')
const HTTP2_FRAME_HEADER_LENGTH = 9

/**
 * The context of the "http2.connect()" calls.
 */
const http2ClientContext = new AsyncLocalStorage<boolean>()

/**
 * Header fields specific to an HTTP/1 connection.
 * Those must not be sent over HTTP/2.
 * @see https://www.rfc-editor.org/rfc/rfc9113#section-8.2.2
 */
const CONNECTION_SPECIFIC_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
]

interface Http2Connection {
  initiator: unknown
  getClientSession: () => http2.ClientHttp2Session
}

/**
 * Interceptor for HTTP/2 requests in Node.js sent over
 * plaintext connections. Terminates such connections with
 * a server session and handles each of their streams as
 * a separate request.
 */
export class Http2RequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol.for('http2-request-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    const socketInterceptor = Interceptor.singleton(SocketInterceptor)
    socketInterceptor.apply(this)
    this.subscriptions.push(() => {
      socketInterceptor.dispose(this)
    })

    const controller = new AbortController()
    this.subscriptions.push(() => controller.abort())

    /**
     * @note Tell the sockets of the HTTP/2 clients apart. A client
     * session starts reading from its socket, and its socket connects,
     * within the "http2.connect()" call. Both are observed from the
     * context of that call.
     */
    this.subscriptions.push(
      patchesRegistry.applyPatch(http2, 'connect', (realConnect) => {
        return new Proxy(realConnect, {
          apply(target, thisArg, args) {
            return http2ClientContext.run(true, () => {
              return Reflect.apply(target, thisArg, args)
            })
          },
        })
      })
    )

    socketInterceptor.on(
      'connection',
      ({ connectionOptions, socket, controller: socketController }) => {
        let isHttp2Connection: boolean | undefined

        const shouldPassthrough = () => {
          return (
            socketController.readyState === SocketController.PENDING &&
            !socket.destroyed
          )
        }

        /**
         * @note HTTP/2 over TLS is not intercepted. Pass any
         * TLS connection through right away, before its handshake.
         */
        if (socketController instanceof TlsSocketController) {
          if (shouldPassthrough()) {
            socketController.passthrough()
          }

          return
        }

        const transport = createServerTransport(socket)

        /**
         * @note Settle the connection as non-HTTP/2 and pass it through
         * in a single step. Nothing can then observe it half-settled
         * (e.g. a connection preface arriving in between).
         */
        const passthroughNonHttp2 = () => {
          isHttp2Connection = false
          transport.destroy()

          if (shouldPassthrough()) {
            socketController.passthrough()
          }
        }

        const acceptConnection = () => {
          isHttp2Connection = true
          socketController.claim()

          /**
           * @note Serve the connection once the client connects, just
           * like the real server would. This preserves the correct
           * order of events on the client (e.g. connect, then data).
           */
          if (socket.connecting) {
            socket.once('connect', serveConnection)
          } else {
            serveConnection()
          }
        }

        const serveConnection = () => {
          const serverSession = http2.performServerHandshake(transport)
          let clientSession: http2.ClientHttp2Session | undefined

          /**
           * @note A single connection to the original server carries
           * every passed-through stream of this connection, the same
           * way the client multiplexes them over its own connection.
           * It is established only once a stream is passed through.
           */
          const getClientSession = () => {
            if (clientSession == null || clientSession.destroyed) {
              const realSession = http2.connect(
                connectionOptionsToUrl(connectionOptions, socket),
                {
                  createConnection: () => {
                    return socketController.createConnection()
                  },
                }
              )

              // The original connection failing fails the client's connection.
              realSession.once('error', (error) => {
                socket.destroy(error)
              })

              clientSession = realSession
            }

            return clientSession
          }

          /**
           * @note Once this interceptor is disposed of, nothing handles
           * the requests of this connection. Close it gracefully so
           * the streams in flight finish and the client connects anew.
           */
          const closeServerSession = () => {
            serverSession.close()
          }
          controller.signal.addEventListener('abort', closeServerSession)

          serverSession
            .on('stream', (stream, headers, flags) => {
              void this.#handleStream(stream, headers, flags, {
                initiator: socket,
                getClientSession,
              })
            })
            .on('error', (error) => {
              this.logger.verbose('server session error %o', error)
            })
            .once('close', () => {
              controller.signal.removeEventListener(
                'abort',
                closeServerSession
              )
              clientSession?.destroy()
            })
        }

        /**
         * @note A client with a prior knowledge of HTTP/2 negotiates
         * nothing: its connection preface tells the protocol apart.
         */
        socket.once('data', (chunk: Buffer) => {
          if (
            shouldPassthrough() &&
            chunk
              .subarray(0, HTTP2_CONNECTION_PREFACE.byteLength)
              .equals(HTTP2_CONNECTION_PREFACE)
          ) {
            acceptConnection()
            return
          }

          // Let the client finish its write before flushing it.
          setImmediate(passthroughNonHttp2)
        })

        /**
         * @note A client that waits for the server to speak first starts
         * reading without writing anything, so the protocol detection
         * never runs. Pass such connections through once the client
         * reads and still no bytes have arrived.
         */
        const rawSocket = socketController[kRawSocket]
        const onClientRead = (event: string | symbol) => {
          if (event !== 'data' && event !== 'readable') {
            return
          }

          rawSocket.removeListener('newListener', onClientRead)

          /**
           * @note An HTTP/2 client always speaks first but sends its
           * connection preface some time after it starts reading.
           * Await the preface of such a client instead of guessing.
           */
          if (http2ClientContext.getStore()) {
            return
          }

          /**
           * @note Clients this interceptor cannot tell apart may still
           * be HTTP/2 clients (e.g. "connect" imported before the patch
           * was applied). Node.js sends the connection preface from a
           * native immediate scheduled as the session starts reading,
           * which runs within the next two iterations of the event
           * loop, ahead of the immediates scheduled from JavaScript.
           */
          setImmediate(() => {
            setImmediate(() => {
              if (isHttp2Connection === undefined) {
                passthroughNonHttp2()
              }
            })
          })
        }

        rawSocket.on('newListener', onClientRead)

        if (
          rawSocket.listenerCount('data') +
            rawSocket.listenerCount('readable') >
          0
        ) {
          onClientRead('data')
        }
      },
      {
        signal: controller.signal,
      }
    )
  }

  async #handleStream(
    stream: http2.ServerHttp2Stream,
    headers: http2.IncomingHttpHeaders,
    flags: number,
    connection: Http2Connection
  ): Promise<void> {
    const requestId = createRequestId()
    const requestAbortController = new AbortController()

    /**
     * @note The client resetting the stream while its request is still
     * pending means the request was aborted. Abort the request so its
     * handling settles.
     */
    stream
      .once('aborted', () => {
        if (requestController.readyState === RequestController.PENDING) {
          requestAbortController.abort()
        }
      })
      .on('error', (error) => {
        this.logger.verbose('stream error %o', error)
      })

    const request = toFetchRequest(
      stream,
      headers,
      flags,
      requestAbortController.signal
    )

    this.logger.verbose('received an HTTP/2 request %o', {
      method: request.method,
      url: request.url,
    })

    const requestController = new RequestController(
      request,
      {
        respondWith: (response) => {
          return this.#respondWith(stream, response, context)
        },
        errorWith: () => {
          stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR)
        },
        passthrough: () => {
          this.#passthrough(
            stream,
            headers,
            connection.getClientSession(),
            context
          )
        },
      },
      {
        logger: this.logger,
        requestId,
      }
    )

    /**
     * @note Create a request resolution context so the modifications
     * to the request in the listeners are picked up on passthrough.
     */
    const context: HandleRequestOptions = {
      initiator: connection.initiator,
      requestId,
      request,
      controller: requestController,
      emitter: this.emitter,
      logger: this.logger,
    }

    await handleRequest(context)
  }

  async #respondWith(
    stream: http2.ServerHttp2Stream,
    rawResponse: Response,
    context: HandleRequestOptions
  ): Promise<void> {
    // The client may reset the stream moments before a response arrives.
    if (stream.destroyed) {
      return
    }

    if (isResponseError(rawResponse)) {
      stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR)
      return
    }

    const originalResponse = FetchResponse.from(rawResponse, {
      url: context.request.url,
    })
    const [response, responseClone] =
      this.emitter.listenerCount('response') > 0
        ? cloneResponse(originalResponse)
        : [originalResponse, null]

    if (responseClone) {
      await this.emitter.emitAsPromise(
        new HttpResponseEvent({
          initiator: context.initiator,
          requestId: context.requestId,
          request: context.request,
          response: responseClone,
          responseType: 'mock',
        })
      )
    }

    // The client may also reset the stream while the listeners run.
    if (stream.destroyed) {
      return
    }

    const responseHeaders: http2.OutgoingHttpHeaders = {
      ':status': response.status,
    }

    for (const [name, value] of response.headers) {
      if (!CONNECTION_SPECIFIC_HEADERS.includes(name)) {
        responseHeaders[name] = value
      }
    }

    const responseCookies = response.headers.getSetCookie()

    if (responseCookies.length > 0) {
      responseHeaders['set-cookie'] = responseCookies
    }

    // A response to a "HEAD" request describes the body without sending it.
    if (response.body == null || context.request.method === 'HEAD') {
      stream.respond(responseHeaders, { endStream: true })
      return
    }

    stream.respond(responseHeaders)

    await pipeline(Readable.from(response.body), stream).catch((error) => {
      this.logger.verbose('failed to send the mocked response %o', error)
    })
  }

  /**
   * Perform the given stream's request against the original
   * server, forwarding its response to the client as-is.
   */
  #passthrough(
    stream: http2.ServerHttp2Stream,
    headers: http2.IncomingHttpHeaders,
    clientSession: http2.ClientHttp2Session,
    context: HandleRequestOptions
  ): void {
    const { request } = context

    const realStream = clientSession.request(
      toOriginalRequestHeaders(headers, request),
      { endStream: request.body == null }
    )

    if (request.body != null) {
      Readable.from(request.body).pipe(realStream)
    }

    let responseTrailers: http2.IncomingHttpHeaders | undefined

    realStream
      .once('response', (responseHeaders) => {
        if (this.emitter.listenerCount('response') === 0) {
          stream.respond(responseHeaders, { waitForTrailers: true })
          realStream.pipe(stream)
          return
        }

        void this.#forwardObservedResponse(
          stream,
          realStream,
          responseHeaders,
          context
        ).catch((error) => {
          this.logger.verbose('failed to forward the response %o', error)
        })
      })
      .once('trailers', (trailers) => {
        responseTrailers = trailers
      })
      .once('error', (error) => {
        this.logger.verbose('original stream error %o', error)
      })
      .once('close', () => {
        // The original server resetting the stream resets it for the client.
        if (realStream.rstCode !== http2.constants.NGHTTP2_NO_ERROR) {
          stream.close(realStream.rstCode)
        }
      })

    stream
      .once('wantTrailers', () => {
        stream.sendTrailers(responseTrailers ?? {})
      })
      .once('close', () => {
        // The client resetting the stream resets it for the original server.
        if (stream.rstCode !== http2.constants.NGHTTP2_NO_ERROR) {
          realStream.close(stream.rstCode)
        }
      })
  }

  /**
   * Forward the original response to the client once the "response"
   * event listeners settle. This guarantees that the client does not
   * receive the response before the listeners are done.
   */
  async #forwardObservedResponse(
    stream: http2.ServerHttp2Stream,
    realStream: http2.ClientHttp2Stream,
    responseHeaders: http2.IncomingHttpHeaders & http2.IncomingHttpStatusHeader,
    context: HandleRequestOptions
  ): Promise<void> {
    const [responseBody, observedResponseBody] = toWebStream(realStream).tee()

    await this.emitter.emitAsPromise(
      new HttpResponseEvent({
        initiator: context.initiator,
        requestId: context.requestId,
        request: context.request,
        response: toFetchResponse(
          observedResponseBody,
          responseHeaders,
          context.request
        ),
        responseType: 'original',
      })
    )

    if (stream.destroyed) {
      return
    }

    stream.respond(responseHeaders, { waitForTrailers: true })
    await pipeline(Readable.from(responseBody), stream)
  }
}

/**
 * Create a transport for the server session out of the given
 * server socket: reading from it yields what the client writes,
 * and writing to it delivers the data to the client.
 */
function createServerTransport(socket: net.Socket): Duplex {
  let pendingData: Buffer = Buffer.alloc(0)

  const readFrame = (): Buffer | undefined => {
    if (pendingData.byteLength < HTTP2_FRAME_HEADER_LENGTH) {
      return undefined
    }

    // A frame starts with the length of its payload (24 bits).
    const frameLength = HTTP2_FRAME_HEADER_LENGTH + pendingData.readUIntBE(0, 3)

    if (pendingData.byteLength < frameLength) {
      return undefined
    }

    const frame = pendingData.subarray(0, frameLength)
    pendingData = pendingData.subarray(frameLength)

    return frame
  }

  const transport = new Duplex({
    read() {},
    write(chunk: Buffer, encoding, callback) {
      pendingData = Buffer.concat([pendingData, chunk])

      /**
       * @note Deliver the frames to the client one at a time. The
       * client session reads them from a JavaScript stream, where
       * Node.js does not run the pending ticks between the frames
       * read at once, like it does when reading from a native socket.
       * Events scheduled by one frame (e.g. "response" by the headers)
       * would then emit after the events of the frames that follow
       * (e.g. "data").
       */
      const writeNextFrame = () => {
        const frame = readFrame()

        if (frame == null) {
          callback()
          return
        }

        socket.write(frame, () => {
          setImmediate(writeNextFrame)
        })
      }

      writeNextFrame()
    },
    final(callback) {
      socket.end(callback)
    },
  })

  const onClientData = (chunk: Buffer) => {
    transport.push(chunk)
  }

  socket.on('data', onClientData)
  socket.once('close', () => {
    transport.destroy()
  })
  transport.once('close', () => {
    socket.removeListener('data', onClientData)
  })

  return transport
}

/**
 * Create a web stream that reads the given stream on demand,
 * preserving the backpressure of whoever consumes it.
 */
function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  const chunks = stream.iterator({ destroyOnReturn: false })

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const { done, value } = await chunks.next()

        if (done) {
          controller.close()
          return
        }

        controller.enqueue(value)
      },
    },
    {
      /**
       * @note Do not read anything ahead of the consumer. A stream
       * nobody has read from can be closed by its session once
       * responded to, even if its other side never finishes.
       */
      highWaterMark: 0,
    }
  )
}

function toFetchHeaders(headers: http2.IncomingHttpHeaders): Headers {
  const fetchHeaders = new Headers()

  for (const [name, value] of Object.entries(headers)) {
    // Pseudo-headers describe the message itself.
    if (name.startsWith(':') || value == null) {
      continue
    }

    for (const headerValue of Array.isArray(value) ? value : [value]) {
      fetchHeaders.append(name, headerValue)
    }
  }

  return fetchHeaders
}

function toFetchRequest(
  stream: http2.ServerHttp2Stream,
  headers: http2.IncomingHttpHeaders,
  flags: number,
  signal: AbortSignal
): Request {
  const hasBody = (flags & http2.constants.NGHTTP2_FLAG_END_STREAM) === 0

  return new FetchRequest(
    new URL(
      headers[':path'] ?? '/',
      `${headers[':scheme']}://${headers[':authority']}`
    ),
    {
      method: headers[':method'],
      headers: toFetchHeaders(headers),
      body: hasBody ? toWebStream(stream) : null,
      signal,
    }
  )
}

function toFetchResponse(
  body: ReadableStream<Uint8Array>,
  headers: http2.IncomingHttpHeaders & http2.IncomingHttpStatusHeader,
  request: Request
): Response {
  const status = headers[':status'] ?? 200

  return new FetchResponse(
    FetchResponse.isResponseWithBody(status) ? body : null,
    {
      url: request.url,
      status,
      headers: toFetchHeaders(headers),
    }
  )
}

/**
 * Create the headers of the request to the original server:
 * the pseudo-headers the client has sent and the headers
 * of the given request (reflecting any modifications to it).
 */
function toOriginalRequestHeaders(
  headers: http2.IncomingHttpHeaders,
  request: Request
): http2.OutgoingHttpHeaders {
  const requestHeaders: http2.OutgoingHttpHeaders = {}

  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(':')) {
      requestHeaders[name] = value
    }
  }

  for (const [name, value] of request.headers) {
    requestHeaders[name] = value
  }

  return requestHeaders
}
