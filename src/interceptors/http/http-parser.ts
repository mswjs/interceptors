import {
  HTTPParser,
  type HeadersCallback,
  type RequestHeadersCompleteCallback,
  type ResponseHeadersCompleteCallback,
} from '_http_common'
import net from 'node:net'
import { Readable } from 'node:stream'
import { invariant } from 'outvariant'
import { FetchRequest, FetchResponse } from '../../utils/fetchUtils'

type HttpParserKind = typeof HTTPParser.REQUEST | typeof HTTPParser.RESPONSE

interface ParserHooks<ParserKind extends HttpParserKind> {
  onMessageBegin?: () => void
  onHeaders?: HeadersCallback
  onHeadersComplete?: ParserKind extends typeof HTTPParser.REQUEST
    ? RequestHeadersCompleteCallback
    : ResponseHeadersCompleteCallback
  onBody?: (chunk: Buffer) => void
  onMessageComplete?: () => void
  onExecute?: () => void
  onTimeout?: () => void
}

export class HttpParser<ParserKind extends HttpParserKind> {
  static REQUEST = HTTPParser.REQUEST
  static RESPONSE = HTTPParser.RESPONSE

  #parser: HTTPParser<ParserKind>

  constructor(kind: ParserKind, hooks: ParserHooks<ParserKind>) {
    this.#parser = new HTTPParser()
    this.#parser.initialize(kind, {})

    this.#parser[HTTPParser.kOnMessageBegin] = hooks.onMessageBegin
    this.#parser[HTTPParser.kOnHeaders] = hooks.onHeaders
    this.#parser[HTTPParser.kOnHeadersComplete] = hooks.onHeadersComplete
    this.#parser[HTTPParser.kOnBody] = hooks.onBody
    this.#parser[HTTPParser.kOnMessageComplete] = hooks.onMessageComplete
    this.#parser[HTTPParser.kOnExecute] = hooks.onExecute
    this.#parser[HTTPParser.kOnTimeout] = hooks.onTimeout
  }

  public execute(data: Buffer): void {
    this.#parser.execute(data)
  }

  /**
   * @see https://github.com/nodejs/node/blob/f3adc11e37b8bfaaa026ea85c1cf22e3a0e29ae9/lib/_http_common.js#L180
   */
  public free(socket?: net.Socket): void {
    if (this.#parser._consumed) {
      this.#parser.unconsume()
    }

    this.#parser._headers = []
    this.#parser._url = ''
    this.#parser.socket = null
    this.#parser.incoming = null
    this.#parser.outgoing = null
    this.#parser.maxHeaderPairs = 2000
    this.#parser[HTTPParser.kOnMessageBegin] = null
    this.#parser[HTTPParser.kOnExecute] = null
    this.#parser[HTTPParser.kOnTimeout] = null
    this.#parser._consumed = false
    this.#parser.onIncoming = null
    this.#parser.joinDuplicateHeaders = null

    this.#parser.remove()
    this.#parser.free()

    if (socket) {
      Reflect.set(socket, 'parser', null)
    }
  }
}

interface HttpRequestParserOptions {
  connectionOptions: {
    method?: string
    url: URL
  }
  onRequest: (request: Request) => void
}

export class HttpRequestParser extends HttpParser<typeof HttpParser.REQUEST> {
  #rawHeadersBuffer: Array<string>
  #requestBodyStream?: Readable

  constructor(options: HttpRequestParserOptions) {
    super(HttpParser.REQUEST, {
      onHeaders: (rawHeaders) => {
        this.#rawHeadersBuffer.push(...rawHeaders)
      },
      onHeadersComplete: (
        _,
        __,
        rawHeaders = [],
        ___,
        path,
        ____,
        _____,
        ______,
        shouldKeepAlive
      ) => {
        const method = options.connectionOptions.method?.toUpperCase() || 'GET'
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
          method,
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

  public free(socket?: net.Socket): void {
    super.free(socket)
    this.#rawHeadersBuffer.length = 0
    this.#requestBodyStream = undefined
  }
}

export class HttpResponseParser extends HttpParser<typeof HttpParser.RESPONSE> {
  #responseRawHeadersBuffer: Array<string>
  #responseBodyStream?: Readable | null

  constructor(options: { onResponse: (response: Response) => void }) {
    super(HttpParser.RESPONSE, {
      onHeaders: (rawHeaders) => {
        this.#responseRawHeadersBuffer.push(...rawHeaders)
      },
      onHeadersComplete: (
        versionMajor,
        versionMinor,
        rawHeaders,
        method,
        url,
        status,
        statusText
      ) => {
        const headers = FetchResponse.parseRawHeaders([
          ...this.#responseRawHeadersBuffer,
          ...(rawHeaders || []),
        ])

        const response = new FetchResponse(
          FetchResponse.isResponseWithBody(status)
            ? (Readable.toWeb(
                (this.#responseBodyStream = new Readable({ read() {} }))
              ) as any)
            : null,
          {
            url,
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

  public free(socket?: net.Socket): void {
    super.free(socket)
    this.#responseRawHeadersBuffer = []
    this.#responseBodyStream = null
  }
}
