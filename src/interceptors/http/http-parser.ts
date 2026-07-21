import { Readable } from 'node:stream'
import { invariant } from 'outvariant'
import { FetchRequest, FetchResponse } from '../../utils/fetchUtils'
import { HttpParser } from './http-parser/index'

interface HttpRequestParserOptions {
  connectionOptions: {
    method?: string
    url: URL
  }
  onRequest: (request: Request, abortController: AbortController) => void
}

export class HttpRequestParser extends HttpParser<1> {
  #requestBodyStream?: Readable

  constructor(options: HttpRequestParserOptions) {
    super(1, {
      onHeadersComplete: ({ rawHeaders, method, url: path }) => {
        /**
         * @note When the socket is reused, "connectionOptions" will point
         * to the "net.connect()" call options that established the connection,
         * which may differ from the description of the current request (e.g. method).
         * Rely on the HTTPParser supplying us with the correct "rawMethod" number.
         */
        const finalMethod = (
          method ||
          options.connectionOptions.method ||
          'GET'
        ).toUpperCase()

        const url = new URL(path || '', options.connectionOptions.url)
        const headers = FetchResponse.parseRawHeaders([...rawHeaders])

        // Translate the basic authorization to request headers.
        // Constructing a Request instance with a URL containing auth is no-op.
        if (url.username || url.password) {
          if (!headers.has('authorization')) {
            const credentials = Buffer.from(
              `${url.username}:${url.password}`
            ).toString('base64')
            headers.set('authorization', `Basic ${credentials}`)
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

        /**
         * @note Expose an abort controller for the parsed request so the
         * consumer can abort it (e.g. when the client destroys the
         * connection before the request is handled).
         */
        const abortController = new AbortController()

        const request = new FetchRequest(url, {
          method: finalMethod,
          headers,
          credentials: 'same-origin',
          body: Readable.toWeb(this.#requestBodyStream) as any,
          signal: abortController.signal,
        })
        options.onRequest(request, abortController)
      },
      onBody: (chunk) => {
        invariant(
          this.#requestBodyStream,
          'Failed to write to a request stream: stream does not exist. This is likely an issue with the library. Please report it on GitHub.'
        )

        this.#requestBodyStream.push(chunk)
      },
      onMessageComplete: () => {
        this.#requestBodyStream?.push(null)
      },
    })
  }

  public free(): void {
    this.destroy()
    this.#requestBodyStream?.destroy()
    this.#requestBodyStream = undefined
  }
}

export class HttpResponseParser extends HttpParser<2> {
  #responseBodyStream?: Readable | null

  constructor(options: { onResponse: (response: Response) => void }) {
    super(2, {
      onHeadersComplete: ({
        rawHeaders,
        statusCode: status,
        statusMessage: statusText,
      }) => {
        const headers = FetchResponse.parseRawHeaders([...rawHeaders])

        const response = new FetchResponse(
          FetchResponse.isResponseWithBody(status)
            ? (Readable.toWeb(
                (this.#responseBodyStream = new Readable({ read() {} }))
              ) as any)
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
  }

  public free(): void {
    this.destroy()
    this.#responseBodyStream = null
  }
}
