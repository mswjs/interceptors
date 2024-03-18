import net from 'node:net'
import {
  HTTPParser,
  type RequestHeadersCompleteCallback,
  type ResponseHeadersCompleteCallback,
} from '_http_common'
import { STATUS_CODES } from 'node:http'
import { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { invariant } from 'outvariant'
import { MockSocket } from '../Socket/MockSocket'
import type { NormalizedWriteArgs } from '../Socket/utils/normalizeWriteArgs'
import { isPropertyAccessible } from '../../utils/isPropertyAccessible'
import { baseUrlFromConnectionOptions } from '../Socket/utils/baseUrlFromConnectionOptions'
import { parseRawHeaders } from '../Socket/utils/parseRawHeaders'
import { getRawFetchHeaders } from '../../utils/getRawFetchHeaders'
import { RESPONSE_STATUS_CODES_WITHOUT_BODY } from '../../utils/responseUtils'

type HttpConnectionOptions = any

export type MockHttpSocketRequestCallback = (args: {
  requestId: string
  request: Request
  socket: MockHttpSocket
}) => void

export type MockHttpSocketResponseCallback = (args: {
  requestId: string
  request: Request
  response: Response
  isMockedResponse: boolean
  socket: MockHttpSocket
}) => void

interface MockHttpSocketOptions {
  connectionOptions: HttpConnectionOptions
  createConnection: () => net.Socket
  onRequest: MockHttpSocketRequestCallback
  onResponse: MockHttpSocketResponseCallback
}

const kRequestId = Symbol('kRequestId')

export class MockHttpSocket extends MockSocket {
  private connectionOptions: HttpConnectionOptions
  private createConnection: () => net.Socket
  private baseUrl: URL

  private onRequest: MockHttpSocketRequestCallback
  private onResponse: MockHttpSocketResponseCallback

  private writeBuffer: Array<NormalizedWriteArgs> = []
  private request?: Request
  private requestParser: HTTPParser<0>
  private requestStream?: Readable
  private shouldKeepAlive?: boolean

  private responseType: 'mock' | 'bypassed' = 'bypassed'
  private responseParser: HTTPParser<1>
  private responseStream?: Readable

  constructor(options: MockHttpSocketOptions) {
    super({
      write: (chunk, encoding, callback) => {
        this.writeBuffer.push([chunk, encoding, callback])

        if (chunk) {
          this.requestParser.execute(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
          )
        }
      },
      read: (chunk) => {
        if (chunk !== null) {
          this.responseParser.execute(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          )
        }
      },
    })

    this.connectionOptions = options.connectionOptions
    this.createConnection = options.createConnection
    this.onRequest = options.onRequest
    this.onResponse = options.onResponse

    this.baseUrl = baseUrlFromConnectionOptions(this.connectionOptions)

    // Request parser.
    this.requestParser = new HTTPParser()
    this.requestParser.initialize(HTTPParser.REQUEST, {})
    this.requestParser[HTTPParser.kOnHeadersComplete] =
      this.onRequestStart.bind(this)
    this.requestParser[HTTPParser.kOnBody] = this.onRequestBody.bind(this)
    this.requestParser[HTTPParser.kOnMessageComplete] =
      this.onRequestEnd.bind(this)

    // Response parser.
    this.responseParser = new HTTPParser()
    this.responseParser.initialize(HTTPParser.RESPONSE, {})
    this.responseParser[HTTPParser.kOnHeadersComplete] =
      this.onResponseStart.bind(this)
    this.responseParser[HTTPParser.kOnBody] = this.onResponseBody.bind(this)
    this.responseParser[HTTPParser.kOnMessageComplete] =
      this.onResponseEnd.bind(this)

    // Once the socket is finished, nothing can write to it
    // anymore. It has also flushed any buffered chunks.
    this.once('finish', () => this.requestParser.free())
  }

  public destroy(error?: Error | undefined): this {
    // Destroy the response parser when the socket gets destroyed.
    // Normally, we shoud listen to the "close" event but it
    // can be suppressed by using the "emitClose: false" option.
    this.responseParser.free()
    return super.destroy(error)
  }

  /**
   * Establish this Socket connection as-is and pipe
   * its data/events through this Socket.
   */
  public passthrough(): void {
    const socket = this.createConnection()

    // Write the buffered request body chunks.
    // Exhaust the "requestBuffer" in case this Socket
    // gets reused for different requests.
    let writeArgs: NormalizedWriteArgs | undefined
    let headersWritten = false

    while ((writeArgs = this.writeBuffer.shift())) {
      if (writeArgs !== undefined) {
        if (!headersWritten) {
          const [chunk, encoding, callback] = writeArgs
          const chunkString = chunk.toString()
          const chunkBeforeRequestHeaders = chunkString.slice(
            0,
            chunkString.indexOf('\r\n') + 2
          )
          const chunkAfterRequestHeaders = chunkString.slice(
            chunk.indexOf('\r\n\r\n')
          )
          const requestHeaders =
            getRawFetchHeaders(this.request!.headers) || this.request!.headers
          const requestHeadersString = Array.from(requestHeaders.entries())
            .map(([name, value]) => `${name}: ${value}`)
            .join('\r\n')

          // Modify the HTTP request message headers
          // to reflect any changes to the request headers
          // from the "request" event listener.
          const headersChunk = `${chunkBeforeRequestHeaders}${requestHeadersString}${chunkAfterRequestHeaders}`
          socket.write(headersChunk, encoding, callback)
          headersWritten = true
          continue
        }

        socket.write(...writeArgs)
      }
    }

    socket
      .on('lookup', (...args) => this.emit('lookup', ...args))
      .on('connect', () => {
        this.connecting = socket.connecting
        this.emit('connect')
      })
      .on('secureConnect', () => this.emit('secureConnect'))
      .on('secure', () => this.emit('secure'))
      .on('session', (session) => this.emit('session', session))
      .on('ready', () => this.emit('ready'))
      .on('drain', () => this.emit('drain'))
      .on('data', (chunk) => {
        // Push the original response to this socket
        // so it triggers the HTTP response parser. This unifies
        // the handling pipeline for original and mocked response.
        this.push(chunk)
      })
      .on('error', (error) => {
        Reflect.set(this, '_hadError', Reflect.get(socket, '_hadError'))
        this.emit('error', error)
      })
      .on('resume', () => this.emit('resume'))
      .on('timeout', () => this.emit('timeout'))
      .on('prefinish', () => this.emit('prefinish'))
      .on('finish', () => this.emit('finish'))
      .on('close', (hadError) => this.emit('close', hadError))
  }

  /**
   * Convert the given Fetch API `Response` instance to an
   * HTTP message and push it to the socket.
   */
  public async respondWith(response: Response): Promise<void> {
    // Handle "type: error" responses.
    if (isPropertyAccessible(response, 'type') && response.type === 'error') {
      this.errorWith(new TypeError('Network error'))
      return
    }

    // First, emit all the connection events
    // to emulate a successful connection.
    this.mockConnect()
    this.responseType = 'mock'

    const httpHeaders: Array<Buffer> = []

    httpHeaders.push(
      Buffer.from(
        `HTTP/1.1 ${response.status} ${response.statusText || STATUS_CODES[response.status]}\r\n`
      )
    )

    // Get the raw headers stored behind the symbol to preserve name casing.
    const headers = getRawFetchHeaders(response.headers) || response.headers
    for (const [name, value] of headers) {
      httpHeaders.push(Buffer.from(`${name}: ${value}\r\n`))
    }

    // An empty line separating headers from the body.
    httpHeaders.push(Buffer.from('\r\n'))

    const flushHeaders = (value?: Uint8Array) => {
      if (httpHeaders.length === 0) {
        return
      }

      if (typeof value !== 'undefined') {
        httpHeaders.push(Buffer.from(value))
      }

      this.push(Buffer.concat(httpHeaders))
      httpHeaders.length = 0
    }

    if (response.body) {
      const reader = response.body.getReader()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        // Flush the headers upon the first chunk in the stream.
        // This ensures the consumer will start receiving the response
        // as it streams in (subsequent chunks are pushed).
        if (httpHeaders.length > 0) {
          flushHeaders(value)
          continue
        }

        // Subsequent body chukns are push to the stream.
        this.push(value)
      }
    }

    // If the headers were not flushed up to this point,
    // this means the response either had no body or had
    // an empty body stream. Flush the headers.
    if (httpHeaders.length > 0) {
      flushHeaders()
    }

    // Close the socket if the connection wasn't marked as keep-alive.
    if (!this.shouldKeepAlive) {
      this.emit('readable')

      /**
       * @todo @fixme This is likely a hack.
       * Since we push null to the socket, it never propagates to the
       * parser, and the parser never calls "onResponseEnd" to close
       * the response stream. We are closing the stream here manually
       * but that shouldn't be the case.
       */
      this.responseStream?.push(null)
      this.push(null)
    }
  }

  /**
   * Close this Socket connection with the given error.
   */
  public errorWith(error: Error): void {
    this.destroy(error)
  }

  private mockConnect(): void {
    this.emit('lookup', null, '::1', 6, this.connectionOptions.host)
    this.emit('connect')
    this.emit('ready')

    if (this.baseUrl.protocol === 'https:') {
      this.emit('secure')
      this.emit('secureConnect')
      // A single TLS connection is represented by two "session" events.
      this.emit('session', Buffer.from('mock-session-renegotiate'))
      this.emit('session', Buffer.from('mock-session-resume'))
    }
  }

  private onRequestStart: RequestHeadersCompleteCallback = (
    versionMajor,
    versionMinor,
    rawHeaders,
    _,
    path,
    __,
    ___,
    ____,
    shouldKeepAlive
  ) => {
    this.shouldKeepAlive = shouldKeepAlive

    const url = new URL(path, this.baseUrl)
    const method = this.connectionOptions.method || 'GET'
    const headers = parseRawHeaders(rawHeaders)
    const canHaveBody = method !== 'GET' && method !== 'HEAD'

    // Translate the basic authorization in the URL to the request header.
    // Constructing a Request instance with a URL containing auth is no-op.
    if (url.username || url.password) {
      if (!headers.has('authorization')) {
        headers.set('authorization', `Basic ${url.username}:${url.password}`)
      }
      url.username = ''
      url.password = ''
    }

    // Create a new stream for each request.
    // If this Socket is reused for multiple requests,
    // this ensures that each request gets its own stream.
    // One Socket instance can only handle one request at a time.
    if (canHaveBody) {
      this.requestStream = new Readable({
        // Dummy implementation. We control the queue in the onRequestBody\End functions
        read: () => {}
      })
    }

    const requestId = randomUUID()
    this.request = new Request(url, {
      method,
      headers,
      credentials: 'same-origin',
      // @ts-expect-error Undocumented Fetch property.
      duplex: canHaveBody ? 'half' : undefined,
      body: canHaveBody ? (Readable.toWeb(this.requestStream!) as any) : null,
    })

    Reflect.set(this.request, kRequestId, requestId)

    /**
     * @fixme Stop relying on the "X-Request-Id" request header
     * to figure out if one interceptor has been invoked within another.
     * @see https://github.com/mswjs/interceptors/issues/378
     */
    if (this.request.headers.has('x-request-id')) {
      this.passthrough()
      return
    }

    this.onRequest({
      requestId,
      request: this.request,
      socket: this,
    })
  }

  private onRequestBody(chunk: Buffer): void {
    invariant(
      this.requestStream,
      'Failed to write to a request stream: stream does not exist'
    )

    this.requestStream.push(chunk)
  }

  private onRequestEnd(): void {
    // Request end can be called for requests without body.
    if (this.requestStream) {
      this.requestStream.push(null)
    }
  }

  private onResponseStart: ResponseHeadersCompleteCallback = (
    versionMajor,
    versionMinor,
    rawHeaders,
    method,
    url,
    status,
    statusText
  ) => {
    const headers = parseRawHeaders(rawHeaders)
    const canHaveBody = !RESPONSE_STATUS_CODES_WITHOUT_BODY.has(status)

    // Similarly, create a new stream for each response.
    if (canHaveBody) {
      this.responseStream = new Readable()
    }

    const response = new Response(
      canHaveBody ? (Readable.toWeb(this.responseStream!) as any) : null,
      {
        status,
        statusText,
        headers,
      }
    )

    invariant(
      this.request,
      'Failed to handle a response: request does not exist'
    )

    /**
     * @fixme Stop relying on the "X-Request-Id" request header
     * to figure out if one interceptor has been invoked within another.
     * @see https://github.com/mswjs/interceptors/issues/378
     */
    if (this.request.headers.has('x-request-id')) {
      return
    }

    this.onResponse({
      response,
      isMockedResponse: this.responseType === 'mock',
      requestId: Reflect.get(this.request, kRequestId),
      request: this.request,
      socket: this,
    })
  }

  private onResponseBody(chunk: Buffer) {
    invariant(
      this.responseStream,
      'Failed to write to a response stream: stream does not exist'
    )

    this.responseStream.push(chunk)
  }

  private onResponseEnd(): void {
    // Response end can be called for responses without body.
    if (this.responseStream) {
      this.responseStream.push(null)
    }
  }
}
