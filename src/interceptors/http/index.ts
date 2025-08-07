import net from 'node:net'
import { Readable, Writable } from 'node:stream'
import { invariant } from 'outvariant'
import { Interceptor, INTERNAL_REQUEST_ID_HEADER_NAME } from '../../Interceptor'
import { type HttpRequestEventMap } from '../../glossary'
import { SocketInterceptor } from '../net'
import { FetchResponse } from '../../utils/fetchUtils'
import { HttpParser } from './http-parser'
import { baseUrlFromConnectionOptions } from '../Socket/utils/baseUrlFromConnectionOptions'
import { MockSocket } from '../net/mock-socket'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'
import { toBuffer } from './utils/to-buffer'
import { createRequestId } from '../../createRequestId'
import { RequestController } from '../../RequestController'
import { handleRequest } from '../../utils/handleRequest'
import {
  getRawFetchHeaders,
  recordRawFetchHeaders,
  restoreHeadersPrototype,
} from '../ClientRequest/utils/recordRawHeaders'
import { isResponseError } from '../../utils/responseUtils'
import { emitAsync } from '../../utils/emitAsync'

/**
 * @fixme Can we use the socket interceptor as a singleton?
 * Also, interceptors are deduped based on the global symbol.
 * Will that merge all the clients listening to their events?
 */
const socketInterceptor = new SocketInterceptor()

export class HttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('HttpRequestInterceptor')

  constructor() {
    super(HttpRequestInterceptor.symbol)
  }

  public setup() {
    socketInterceptor.apply()
    this.subscriptions.push(() => {
      socketInterceptor.dispose()
    })

    recordRawFetchHeaders()
    this.subscriptions.push(() => {
      restoreHeadersPrototype()
    })

    socketInterceptor.on('connection', ({ options, socket }) => {
      socket.runInternally(() => {
        socket.once('write', (chunk, encoding) => {
          const firstFrame = chunk.toString()

          if (!firstFrame.includes('HTTP/')) {
            return
          }

          // Get the request method from the first frame because it's faster
          // and we need this before initiating the HTTP parser.
          const method = firstFrame.split(' ')[0]

          invariant(
            method != null,
            'Failed to handle HTTP request: expected a valid HTTP method but got %s',
            method,
            options
          )

          const requestParser = createHttpRequestParserStream({
            requestOptions: {
              method,
              ...options,
            },
            onRequest: async (request) => {
              const requestId = createRequestId()
              const controller = new RequestController(request)

              const isRequestHandled = await handleRequest({
                request,
                requestId,
                controller,
                emitter: this.emitter,
                onResponse: async (response) => {
                  await respondWith({
                    socket,
                    connectionOptions: options,
                    request,
                    response,
                  })
                  await emitAsync(this.emitter, 'response', {
                    requestId,
                    request,
                    response,
                    isMockedResponse: true,
                  })
                },
                async onRequestError(response) {
                  await respondWith({
                    socket,
                    connectionOptions: options,
                    request,
                    response,
                  })
                  await emitAsync(this.emitter, 'response', {
                    requestId,
                    request,
                    response,
                    isMockedResponse: true,
                  })
                },
                onError(error) {
                  if (error instanceof Error) {
                    socket.destroy(error)
                  }
                },
              })

              if (!isRequestHandled) {
                // If the user didn't register any response listeners, no need to pay the
                // price of routing the entire response message through the parser.
                if (this.emitter.listenerCount('response') > 0) {
                  createHttpResponseParserStream({
                    socket,
                    onResponse: async (response) => {
                      await emitAsync(this.emitter, 'response', {
                        requestId,
                        request,
                        response,
                        isMockedResponse: false,
                      })
                    },
                  })
                }

                const passthroughSocket = socket.passthrough()

                /**
                 * @note Creating a passthrough socket does NOT trigger the "onSocket" callback
                 * of `ClientRequest` because that callback is invoked manually in the request's constructor.
                 * Promote the parser-request-parser association manually from the mocked onto the passthrough socket.
                 * @see https://github.com/nodejs/node/blob/134625d76139b4b3630d5baaf2efccae01ede564/lib/_http_client.js#L422
                 * @see https://github.com/nodejs/node/blob/134625d76139b4b3630d5baaf2efccae01ede564/lib/_http_client.js#L890
                 */
                // @ts-expect-error Node.js internals.
                passthroughSocket._httpMessage = socket._httpMessage
                // @ts-expect-error Node.js internals.
                passthroughSocket.parser = socket.parser
                // @ts-expect-error Node.js internals.
                passthroughSocket.parser.socket = passthroughSocket
              }
            },
          })

          // Write the message header to the parser manually because it's already been written
          // on the socket so it won't get piped.
          requestParser.write(toBuffer(chunk, encoding))
          socket.pipe(requestParser)
        })
      })
    })
  }
}

function createHttpRequestParserStream(options: {
  requestOptions: NetworkConnectionOptions & {
    method: string
  }
  onRequest: (request: Request) => void
}) {
  const requestRawHeadersBuffer: Array<string> = []
  let requestBodyStream: Readable | undefined

  const parser = new HttpParser(HttpParser.REQUEST, {
    onHeaders(rawHeaders) {
      requestRawHeadersBuffer.push(...rawHeaders)
    },
    onHeadersComplete(
      versionMajor,
      versionMinor,
      rawHeaders,
      _,
      path,
      __,
      ___,
      ____,
      shouldKeepAlive
    ) {
      const method = options.requestOptions.method?.toUpperCase() || 'GET'
      const baseUrl = baseUrlFromConnectionOptions(options.requestOptions)
      const url = new URL(path || '', baseUrl)

      const headers = FetchResponse.parseRawHeaders([
        ...requestRawHeadersBuffer,
        ...(rawHeaders || []),
      ])

      const canHaveBody = method !== 'GET' && method !== 'HEAD'

      // Translate the basic authorization to request headers.
      // Constructing a Request instance with a URL containing auth is no-op.
      if (url.username || url.password) {
        if (!headers.has('authorization')) {
          headers.set('authorization', `Basic ${url.username}:${url.password}`)
        }
        url.username = ''
        url.password = ''
      }

      requestBodyStream = new Readable({
        /**
         * @note Provide the `read()` method so a `Readable` could be
         * used as the actual request body (the stream calls "read()").
         */
        read() {
          // If the user attempts to read the request body,
          // flush the write buffer to trigger the callbacks.
          // This way, if the request stream ends in the write callback,
          // it will indeed end correctly.
          // flushWriteBuffer()
        },
      })

      const request = new Request(url, {
        method,
        headers,
        credentials: 'same-origin',
        // @ts-expect-error Undocumented Fetch property.
        duplex: canHaveBody ? 'half' : undefined,
        body: canHaveBody ? (Readable.toWeb(requestBodyStream) as any) : null,
      })

      options.onRequest(request)
    },
    onBody(chunk) {
      invariant(
        requestBodyStream,
        'Failed to write to a request stream: stream does not exist. This is likely an issue with the library. Please report it on GitHub.'
      )

      requestBodyStream.push(chunk)
    },
    onMessageComplete() {
      requestBodyStream?.push(null)
    },
  })

  const parserStream = new Writable({
    write(chunk, encoding, callback) {
      parser.execute(toBuffer(chunk, encoding))
      callback()
    },
  })

  parserStream
    .once('finish', () => parser.free())
    .once('error', () => parser.free())

  return parserStream
}

function createHttpResponseParserStream(options: {
  socket: MockSocket
  onResponse: (response: Response) => void
}) {
  const { socket, onResponse } = options
  const responseRawHeadersBuffer: Array<string> = []
  let responseBodyStream: Readable | undefined

  const parser = new HttpParser(HttpParser.RESPONSE, {
    onHeaders(rawHeaders) {
      responseRawHeadersBuffer.push(...rawHeaders)
    },
    onHeadersComplete(
      versionMajor,
      versionMinor,
      rawHeaders,
      method,
      url,
      status,
      statusText
    ) {
      const headers = FetchResponse.parseRawHeaders([
        ...responseRawHeadersBuffer,
        ...(rawHeaders || []),
      ])

      const response = new FetchResponse(
        FetchResponse.isResponseWithBody(status)
          ? (Readable.toWeb(
              (responseBodyStream = new Readable({ read() {} }))
            ) as any)
          : null,
        {
          url,
          status,
          statusText,
          headers,
        }
      )

      onResponse(response)
    },
    onBody(chunk) {
      invariant(
        responseBodyStream,
        'Failed to read from a response stream: stream does not exist. This is likely an issue with the library. Please report it on GitHub.'
      )

      responseBodyStream.push(chunk)
    },
    onMessageComplete() {
      responseBodyStream?.push(null)
    },
  })

  socket
    .on('push', (chunk, encoding) => {
      parser.execute(toBuffer(chunk, encoding))
    })
    .once('close', () => parser.free())
}

/**
 * Mocks a successful socket connection.
 */
function mockConnect(
  socket: net.Socket,
  connectionOptions: NetworkConnectionOptions
): void {
  const isIPv6 =
    net.isIPv6(connectionOptions.host || '') || connectionOptions.family === 6

  const addressInfo = {
    address: isIPv6 ? '::1' : '127.0.0.1',
    family: isIPv6 ? 'IPv6' : 'IPv4',
    port: connectionOptions.port,
  }

  /**
   * @fixme We used to update `socket.addressInfo` to return the
   * internally constructed `addressInfo`. Still needed?
   */

  socket.emit(
    'lookup',
    null,
    addressInfo,
    addressInfo.family === 'IPv6' ? 6 : 4,
    connectionOptions.host
  )
  socket.emit('connect')
  socket.emit('ready')

  if (connectionOptions.protocol === 'https:') {
    socket.emit('secure')
    socket.emit('secureConnect')
    socket.emit(
      'session',
      connectionOptions.session || Buffer.from('mock-session-renegotiate')
    )
    socket.emit('session', Buffer.from('mock-session-resume'))
  }
}

/**
 * Pushes the given Fetch API `Response` onto the given socket.
 * Automatically establishes a successful mock socket connection.
 */
async function respondWith(args: {
  socket: net.Socket
  connectionOptions: NetworkConnectionOptions
  request: Request
  response: Response
}): Promise<void> {
  const { socket, connectionOptions, request, response } = args

  // Ignore mock responses for destroyed sockets (e.g. aborted, timed out).
  if (socket.destroyed) {
    return
  }

  // Handle `Response.error()` instances.
  if (isResponseError(response)) {
    socket.destroy(new TypeError('Network error'))
    return
  }

  // Establish a mocked socket connection.
  // Prior to this point, the socket has been pending.
  mockConnect(socket, connectionOptions)

  /**
   * @note Import the "node:http" module lazily so it doesn't create a stale closure
   * at the top of this module. Test runners might cache imports and the test will
   * get a cached "node:http" with the unpatched "node:net".
   */
  const { ServerResponse, IncomingMessage, STATUS_CODES } = await import(
    'node:http'
  )

  // Construct a regular server response to delegate body parsing to Node.js.
  const serverResponse = new ServerResponse(new IncomingMessage(socket))

  serverResponse.assignSocket(
    /**
     * @note Provide a dummy stream to the server response to translate all its writes
     * into pushes to the underlying mocked socket. This is only needed because we
     * use `ServerResponse` instead of pushing to mock socket directly (skip parsing).
     */
    new Writable({
      write(chunk, encoding, callback) {
        socket.push(chunk, encoding)
        callback?.()
      },
    }) as net.Socket
  )

  /**
   * @note Remove the `Connection` and `Date` response headers
   * injected by `ServerResponse` by default. Those are required
   * from the server but the interceptor is NOT technically a server.
   * It's confusing to add response headers that the developer didn't
   * specify themselves. They can always add these if they wish.
   * @see https://www.rfc-editor.org/rfc/rfc9110#field.date
   * @see https://www.rfc-editor.org/rfc/rfc9110#field.connection
   */
  serverResponse.removeHeader('connection')
  serverResponse.removeHeader('date')

  // Get the raw response headers to preserve their casing.
  // We're recording the headers manually since the Fetch API
  // normalizes all headers without a way to get the raw values.
  const rawResponseHeaders = getRawFetchHeaders(response.headers)

  // Write the response header, providing the raw headers as-is.
  // Using `.setHeader()`/`.appendHeader()` normalizes header names.
  serverResponse.writeHead(
    response.status,
    response.statusText || STATUS_CODES[response.status],
    rawResponseHeaders
  )

  if (response.body) {
    try {
      const reader = response.body.getReader()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          serverResponse.end()
          break
        }

        serverResponse.write(value)
      }
    } catch (error) {
      if (error instanceof Error) {
        /**
         * Destroy the socket if the response stream errored.
         * @see https://github.com/mswjs/interceptors/issues/738
         */
        socket.destroy(error)
      }
    }
  } else {
    serverResponse.end()
  }

  // Close the connection if it wasn't marked as keep-alive.
  if (request.headers.get('connection') !== 'keep-alive') {
    socket.emit('readable')
    /**
     * @fixme We used to push null to the response stream manually here.
     * Is that still needed?
     */
    socket.push(null)
  }
}
