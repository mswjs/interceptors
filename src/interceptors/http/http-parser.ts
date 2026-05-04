import { Readable } from 'node:stream'
import { invariant } from 'outvariant'
import { FetchRequest, FetchResponse } from '../../utils/fetchUtils'
import { HTTPRequestParser, HTTPResponseParser, constants } from './http-parser/index'
interface HttpRequestParserOptions {
  connectionOptions: {
    method?: string
    url: URL
  }
  onRequest: (request: Request) => void
}

export class HttpRequestParser extends HTTPRequestParser {
  #rawHeadersBuffer: Array<string>
  #requestBodyStream?: Readable

  constructor(options: HttpRequestParserOptions) {
    super({
      // onHeaders: (rawHeaders) => {
      //   this.#rawHeadersBuffer.push(...rawHeaders)
      // },
      onHeadersComplete: ({
        rawHeaders,
        method,
        url: path,
      }) => {
        /**
         * @note When the socket is reused, "connectionOptions" will point
         * to the "net.connect()" call options that established the connection,
         * which may differ from the description of the current request (e.g. method).
         * Rely on the HTTPParser supplying us with the correct "rawMethod" number.
         */
        const resolvedMethod =
          (typeof method === 'string'
            ? method
            : typeof method === 'number'
              ? constants.METHODS[method]
              : options.connectionOptions.method) ||
          options.connectionOptions.method ||
          'GET'
        const finalMethod = resolvedMethod.toUpperCase()

        const url = new URL(path || '', options.connectionOptions.url)
        const headers = FetchResponse.parseRawHeaders([
          ...this.#rawHeadersBuffer,
          ...rawHeaders,
        ])

        // Translate the basic authorization to request headers.
        // Constructing a Request instance with a URL containing auth is no-op.
        if (url.username || url.password) {
          if (!headers.has('authorization')) {
            headers.set(
              'authorization',
              `Basic ${url.username}:${url.password}`
            )
          }
          url.username = ''
          url.password = ''
        }

        this.#requestBodyStream = new Readable({
          /**
           * @note Provide the `read()` method so a `Readable` could be
           * used as the actual request body (the stream calls "read()").
           */
          read: () => {},
        })

        const request = new FetchRequest(url, {
          method: finalMethod,
          headers,
          credentials: 'same-origin',
          body: Readable.toWeb(this.#requestBodyStream) as any,
        })
        options.onRequest(request)
      },
      onBody: (chunk) => {
        invariant(
          this.#requestBodyStream,
          'Failed to write to a request stream: stream does not exist. This is likely an issue with the library. Please report it on GitHub.'
        )

        this.#requestBodyStream.push(chunk)
      },
      onMessageComplete: () => {
        this.#rawHeadersBuffer.length = 0
        this.#requestBodyStream?.push(null)
      },
    })

    this.#rawHeadersBuffer = []
  }

  public free(): void {
    this.destroy()
    this.#rawHeadersBuffer.length = 0
    this.#requestBodyStream = undefined
  }
}

export class HttpResponseParser extends HTTPResponseParser {
  #responseRawHeadersBuffer: Array<string>
  #responseBodyStream?: Readable | null

  constructor(options: { onResponse: (response: Response) => void }) {
    super({
      // onHeaders: (rawHeaders) => {
      //   this.#responseRawHeadersBuffer.push(...rawHeaders)
      // },
      onHeadersComplete: ({
        rawHeaders,
        statusCode: status,
        statusMessage: statusText,
      }) => {
        const headers = FetchResponse.parseRawHeaders([
          ...this.#responseRawHeadersBuffer,
          ...(rawHeaders || []),
        ])

        this.#responseBodyStream = new Readable({ read() {} })

        const response = new FetchResponse(
          FetchResponse.isResponseWithBody(status)
            ? (Readable.toWeb(this.#responseBodyStream) as any)
            : null,
          {
            status,
            statusText,
            headers,
          }
        )

        options.onResponse(response)
      },
      onBody: (chunk) => {
        invariant(
          this.#responseBodyStream,
          'Failed to read from a response stream: stream does not exist. This is likely an issue with the library. Please report it on GitHub.'
        )

        this.#responseBodyStream.push(chunk)
      },
      onMessageComplete: () => {
        this.#responseBodyStream?.push(null)
      },
    })

    this.#responseRawHeadersBuffer = []
  }

  public free(): void {
    this.destroy()
    this.#responseRawHeadersBuffer = []
    this.#responseBodyStream = null
  }
}
