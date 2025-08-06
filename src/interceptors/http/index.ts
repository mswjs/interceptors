import net from 'node:net'
import { Readable, Writable } from 'node:stream'
import { invariant } from 'outvariant'
import { Interceptor, INTERNAL_REQUEST_ID_HEADER_NAME } from '../../Interceptor'
import { type HttpRequestEventMap } from '../../glossary'
import { FetchResponse } from '../../utils/fetchUtils'
import { SocketInterceptor } from '../net'
import { HttpRequestParser } from './http-parser'
import { baseUrlFromConnectionOptions } from '../Socket/utils/baseUrlFromConnectionOptions'
import type { NetworkConnectionOptions } from '../net/utils/normalize-net-connect-args'
import { createRequestId } from '../../createRequestId'
import { RequestController } from '../../RequestController'
import { handleRequest } from '../../utils/handleRequest'
import { toBuffer } from './utils/to-buffer'
import { getRawFetchHeaders } from '../ClientRequest/utils/recordRawHeaders'
import { isResponseError } from '../../utils/responseUtils'
import { MockSocket } from '../Socket/MockSocket'

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
                async onResponse(response) {
                  await respondWith({
                    socket,
                    connectionOptions: options,
                    request,
                    response,
                  })
                },
                async onRequestError(response) {
                  await respondWith({
                    socket,
                    connectionOptions: options,
                    request,
                    response,
                  })
                },
                onError(error) {
                  if (error instanceof Error) {
                    socket.destroy(error)
                  }
                },
              })

              if (!isRequestHandled) {
                const passthroughSocket = socket.passthrough()

                /**
                 * @note Creating a passthroughsocket does NOT trigger the "socket" event
                 * from `http.ClientRequest` where the request, parser, and socket get
                 * associated. Recreate that association on the passthrough socket manually.
                 * @see https://github.com/nodejs/node/blob/134625d76139b4b3630d5baaf2efccae01ede564/lib/_http_client.js#L890
                 */
                // @ts-expect-error Internal Node.js property.
                passthroughSocket._httpMessage = socket._httpMessage
                // @ts-expect-error Internal Node.js property.c
                passthroughSocket.parser = socket.parser
                // @ts-expect-error Internal Node.js property.
                passthroughSocket.parser.socket = passthroughSocket
              }
            },
          })

          // Write the header again because at this point it's already been written.
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

  const parser = new HttpRequestParser({
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

      const headers = new Headers()
      // const headers = FetchResponse.parseRawHeaders([
      //   ...requestRawHeadersBuffer,
      //   ...(rawHeaders || []),
      // ])

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
        'Failed to write to a request stream: stream does not exist'
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

  parserStream.once('finish', () => {
    parser.free()
  })

  return parserStream
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

  /**
   * @note Provide a dummy socket to the server response to translate all its writes
   * into pushes to the underlying mocked socket. This is only needed because we
   * use `ServerResponse` to skip manual response message handling on our end.
   */
  serverResponse.assignSocket(
    new MockSocket({
      write(chunk, encoding, callback) {
        socket.push(chunk, encoding)
        callback?.()
      },
      read() {},
    })
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

  socket.once('error', (error) => {
    // Destroy the mocked response if the developer destroys the socket.
    serverResponse.destroy(error)
  })

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
      /**
       * Translate body stream errors to socket errors.
       * @note We cannot use a mocked 500 response here because
       * the response headers have already been written.
       */
      if (error instanceof Error) {
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
