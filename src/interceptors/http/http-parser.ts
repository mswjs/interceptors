import { Readable } from 'node:stream'
import { invariant } from 'outvariant'
import { FetchRequest, FetchResponse } from '../../utils/fetch-utils'
import { HttpParser } from './http-parser/index'

interface HttpRequestParserOptions {
  onError: (error: Error) => void
  connectionOptions: {
    method?: string
    url: URL
  }
  onRequest: (request: Request, abortController: AbortController) => void
  onMessageComplete?: () => void
}

export class HttpRequestParser extends HttpParser<1> {
  #requestBodyStream?: Readable
  #upgrade = false

  constructor(options: HttpRequestParserOptions) {
    super(1, {
      onError: options.onError,
      onHeadersComplete: ({ rawHeaders, method, url: path, upgrade }) => {
        this.#upgrade = upgrade
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

        /**
         * @note The request target of a "CONNECT" request is the authority
         * to tunnel to (e.g. "example.com:443"), not a path. Resolved
         * against the base URL as-is, a hostname authority parses as a
         * URL scheme ("example.com:"). Keep it as the path instead: that
         * is where the authority is read from (see "FetchRequest").
         */
        const url = new URL(
          finalMethod === 'CONNECT' ? `/${path}` : path || '',
          options.connectionOptions.url
        )
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
        this.#requestBodyStream = undefined

        /**
         * @note An upgraded exchange (e.g. "CONNECT", WebSocket) has
         * no message boundary: it takes the connection over, and the
         * bytes that follow belong to it, not to a next exchange.
         */
        if (!this.#upgrade) {
          options.onMessageComplete?.()
        }
      },
    })
  }

  public free(error?: Error): void {
    this.destroy()
    this.#requestBodyStream?.destroy(error)
    this.#requestBodyStream = undefined
  }
}

export class HttpResponseParser extends HttpParser<2> {
  #responseBodyStream?: Readable | null
  #status = 0

  constructor(options: {
    /**
     * The method of the request this response answers.
     */
    method?: string
    onResponse: (response: Response) => void
    onError: (error: Error) => void
    onMessageComplete?: (status: number) => void
  }) {
    super(2, {
      onError: options.onError,
      onHeadersComplete: ({
        rawHeaders,
        statusCode: status,
        statusMessage: statusText,
      }) => {
        this.#status = status
        const headers = FetchResponse.parseRawHeaders([...rawHeaders])

        /**
         * @note A 2xx response to a "CONNECT" request has no body:
         * it establishes a tunnel, and the bytes that follow belong
         * to the tunnel. Tell llhttp to skip the body and treat the
         * message as an upgrade, the same way the Node.js client does.
         * @see https://github.com/nodejs/node/blob/3178a762d6a2b1a37b74f02266eea0f3d86603f1/lib/_http_client.js#L644
         */
        const isTunnelEstablished =
          options.method === 'CONNECT' && status >= 200 && status < 300

        const response = new FetchResponse(
          FetchResponse.isResponseWithBody(status) && !isTunnelEstablished
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

        if (isTunnelEstablished) {
          return 2
        }
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
        this.#responseBodyStream = null
        options.onMessageComplete?.(this.#status)
      },
    })
  }

  public free(error?: Error): void {
    this.destroy()

    if (error) {
      this.#responseBodyStream?.destroy(error)
    }

    this.#responseBodyStream = null
  }
}
