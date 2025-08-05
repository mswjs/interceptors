import { Readable, Writable } from 'node:stream'
import { invariant } from 'outvariant'
import { Interceptor, INTERNAL_REQUEST_ID_HEADER_NAME } from '../Interceptor'
import { type HttpRequestEventMap } from '../glossary'
import { FetchResponse } from '../utils/fetchUtils'
import { SocketInterceptor } from './net'
import { HttpRequestParser } from './net/parsers'
import { baseUrlFromConnectionOptions } from './Socket/utils/baseUrlFromConnectionOptions'
import { NetworkConnectionOptions } from './net/utils/normalize-net-connect-args'
import { createRequestId } from '../createRequestId'
import { emitAsync } from 'src/utils/emitAsync'
import { RequestController } from '../RequestController'
import { handleRequest } from '../utils/handleRequest'

function toBuffer(data: any, encoding?: BufferEncoding): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data, encoding)
}

export class HttpRequestInterceptor extends Interceptor<HttpRequestEventMap> {
  static symbol = Symbol('HttpRequestInterceptor')

  constructor() {
    super(HttpRequestInterceptor.symbol)
  }

  public setup() {
    /** @fixme Use interceptor as a singleton? */
    const interceptor = new SocketInterceptor()
    interceptor.apply()

    interceptor.on('connection', ({ options, socket }) => {
      socket.once('write', (chunk, encoding) => {
        const firstFrame = chunk.toString()

        if (firstFrame.includes('HTTP/')) {
          const method = firstFrame.split(' ')[0]

          const requestParser = createHttpRequestParserStream({
            requestOptions: {
              method,
              ...options,
            },
            onRequest: async ({ request }) => {
              console.log(1)

              const requestId = createRequestId()
              const controller = new RequestController(request)

              const isRequestHandled = await handleRequest({
                request,
                requestId,
                controller,
                emitter: this.emitter,
                onResponse(response) {
                  console.log('MOCKED!', response.status)
                },
                onRequestError(response) {
                  //
                },
                onError(error) {},
              })

              console.log('REQ! handled?', isRequestHandled)

              if (!isRequestHandled) {
                return socket.passthrough()
              }
            },
          })
          requestParser.write(toBuffer(chunk, encoding))
          socket.pipe(requestParser)
        }
      })
    })
  }
}

function createHttpRequestParserStream(options: {
  requestOptions: NetworkConnectionOptions & {
    method: string
  }
  onRequest: (args: { request: Request }) => void
}) {
  const requestRawHeadersBuffer: Array<string> = []
  const requestWriteBuffer: Array<Buffer> = []
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
        // headers,
        credentials: 'same-origin',
        // @ts-expect-error Undocumented Fetch property.
        duplex: canHaveBody ? 'half' : undefined,
        body: canHaveBody ? (Readable.toWeb(requestBodyStream) as any) : null,
      })

      options.onRequest({
        request,
      })
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
      const data = toBuffer(chunk, encoding)
      requestWriteBuffer.push(data)
      parser.execute(data)
      callback()
    },
  })
  parserStream.once('finish', () => parser.free())

  return parserStream
}
