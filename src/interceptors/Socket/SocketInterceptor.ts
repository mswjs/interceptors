import net from 'node:net'
import { STATUS_CODES } from 'node:http'
import { HTTPParser } from 'node:_http_common'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { until } from '@open-draft/until'
import { Interceptor } from '../../Interceptor'
import {
  InteractiveRequest,
  toInteractiveRequest,
} from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'
import { isPropertyAccessible } from '../../utils/isPropertyAccessible'

type NormalizedSocketConnectArgs = [
  options: NormalizedSocketConnectOptions,
  connectionListener: (() => void) | null,
]

declare module 'node:net' {
  /**
   * Internal `new Socket().connect()` arguments normalization function.
   * @see https://github.com/nodejs/node/blob/29ec7e9331c4944006ffe28e126cc31cc3de271b/lib/net.js#L272
   */
  export var _normalizeArgs: (
    args: Array<unknown>
  ) => NormalizedSocketConnectArgs
}

export interface SocketEventMap {
  request: [
    args: {
      requestId: string
      request: InteractiveRequest
    },
  ]
  response: [
    args: {
      requestId: string
      request: Request
      response: Response
      isMockedResponse: boolean
    },
  ]
}

export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static symbol = Symbol('socket')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const self = this
    const originalConnect = net.Socket.prototype.connect

    net.Socket.prototype.connect = function mockConnect(
      ...args: Array<unknown>
    ) {
      /**
       * @note In some cases, "Socket.prototype.connect" will receive already
       * normalized arguments. The call signature of that method will differ:
       * .connect(port, host, cb) // unnormalized
       * .connect([options, cb, normalizedSymbol]) // normalized
       * Check that and unwrap the arguments to have a consistent format.
       */
      const unwrappedArgs = Array.isArray(args[0]) ? args[0] : args
      const normalizedSocketConnectArgs = net._normalizeArgs(unwrappedArgs)

      const createConnection = () => {
        return originalConnect.apply(this, args)
      }

      const socketWrap = new SocketWrap(
        normalizedSocketConnectArgs,
        createConnection
      )

      socketWrap.onRequest = async (request) => {
        const requestId = randomUUID()
        const { interactiveRequest, requestController } =
          toInteractiveRequest(request)

        self.emitter.once('request', ({ requestId: pendingRequestId }) => {
          if (pendingRequestId !== requestId) {
            return
          }

          if (requestController.responsePromise.state === 'pending') {
            requestController.responsePromise.resolve(undefined)
          }
        })

        const resolverResult = await until(async () => {
          await emitAsync(self.emitter, 'request', {
            requestId,
            request: interactiveRequest,
          })

          return await requestController.responsePromise
        })

        if (resolverResult.error) {
          socketWrap.errorWith(resolverResult.error)
          return
        }

        const mockedResponse = resolverResult.data

        if (mockedResponse) {
          // Handle mocked "Response.error()" instances.
          if (
            isPropertyAccessible(mockedResponse, 'type') &&
            mockedResponse.type === 'error'
          ) {
            socketWrap.errorWith(new TypeError('Network error'))
            return
          }

          socketWrap.respondWith(mockedResponse)
        } else {
          socketWrap.passthrough()
        }

        socketWrap.onResponse = (response) => {
          self.emitter.emit('response', {
            requestId,
            request,
            response,
            isMockedResponse: false,
          })
        }
      }

      return socketWrap
    }

    this.subscriptions.push(() => {
      net.Socket.prototype.connect = originalConnect
    })
  }
}

class SocketWrap extends net.Socket {
  public url: URL
  public onRequest?: (request: Request) => void
  public onResponse?: (response: Response) => void

  private connectionOptions: NormalizedSocketConnectArgs[0]
  private connectionListener: NormalizedSocketConnectArgs[1]
  private requestParser: HttpMessageParser<'request'>
  private responseParser: HttpMessageParser<'response'>
  private requestStream: Readable
  private responseStream: Readable
  private requestChunks: Array<Buffer> = []
  private shouldKeepAlive?: boolean

  constructor(
    readonly socketConnectArgs: ReturnType<typeof net._normalizeArgs>,
    private createConnection: () => net.Socket
  ) {
    super()

    this.connectionOptions = socketConnectArgs[0]
    this.connectionListener = socketConnectArgs[1]

    this.url = parseSocketConnectionUrl(this.connectionOptions)

    this.requestStream = new Readable()
    this.requestParser = new HttpMessageParser('request', {
      onHeadersComplete: (
        major,
        minor,
        headers,
        method,
        path,
        _,
        __,
        ___,
        shouldKeepAlive
      ) => {
        this.shouldKeepAlive = shouldKeepAlive
        this.onRequestStart(path, headers)
      },
      onBody: (chunk) => {
        this.requestStream.push(chunk)
      },
      onMessageComplete: () => {
        this.requestStream.push(null)
        this.requestParser.destroy()
      },
    })

    this.responseStream = new Readable()
    this.responseParser = new HttpMessageParser('response', {
      onHeadersComplete: (
        major,
        minor,
        headers,
        method,
        url,
        status,
        statusText
      ) => {
        this.onResponseStart(status, statusText, headers)
      },
      onBody: (chunk) => {
        this.responseStream.push(chunk)
      },
      onMessageComplete: () => {
        this.responseStream.push(null)
        this.responseParser.destroy()
      },
    })

    this.mockConnect()
  }

  private mockConnect() {
    if (this.connectionListener) {
      this.once('connect', this.connectionListener)
    }

    Reflect.set(this, 'connecting', true)

    queueMicrotask(() => {
      this.emit('lookup', null, '127.0.0.1', 6, this.connectionOptions.host)
      Reflect.set(this, 'connecting', false)

      this.emit('connect')
      this.emit('ready')
    })
  }

  public destroy(error?: Error) {
    queueMicrotask(() => {
      if (error) {
        this.emit('error', error)
      }
      // Override the ".destroy()" method in order to
      // emit the "hadError" argument with the "close" event.
      // For some reason, relying on "super.destroy()" doesn't
      // include that argument, it's undefined.
      this.emit('close', !!error)
    })

    return this
  }

  public write(chunk: Buffer) {
    this.requestChunks.push(chunk)

    if (chunk !== null) {
      this.requestParser.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      )
    }

    return true
  }

  public push(chunk: any, encoding?: BufferEncoding) {
    if (chunk !== null) {
      const chunkBuffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, encoding)
      this.responseParser.push(chunkBuffer)
      this.emit('data', chunkBuffer)
    } else {
      this.emit('end')
    }

    return true
  }

  private onRequestStart(path: string, rawHeaders: Array<string>): void {
    const url = new URL(path, this.url)
    const headers = parseRawHeaders(rawHeaders)

    // Translate URL auth into the authorization request header.
    if (url.username || url.password) {
      if (!headers.has('authorization')) {
        headers.set(
          'authorization',
          `Basic ${btoa(`${url.username}:${url.password}`)}`
        )
      }
      url.username = ''
      url.password = ''
    }

    const method = this.connectionOptions.method || 'GET'
    const isBodyAllowed = method !== 'HEAD' && method !== 'GET'

    const request = new Request(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: isBodyAllowed ? Readable.toWeb(this.requestStream) : null,
      // @ts-expect-error Not documented fetch property.
      duplex: isBodyAllowed ? 'half' : undefined,
    })

    this.onRequest?.(request)
  }

  private onResponseStart(
    status: number,
    statusText: string,
    rawHeaders: Array<string>
  ) {
    const response = new Response(Readable.toWeb(this.responseStream), {
      status,
      statusText,
      headers: parseRawHeaders(rawHeaders),
    })

    this.onResponse?.(response)
  }

  /**
   * Passthrough this Socket connection.
   * Performs the connection as-is, flushing the request body
   * and forwarding any events and response stream to this instance.
   */
  public passthrough(): void {
    const socket = this.createConnection()

    /**
     * @fixme This is not ideal. I'd love not to introduce another
     * place where we store the request body stream. Alas, we cannot
     * read from "this.requestStream.read()" as it returns null
     * (at this point, the stream is drained).
     */
    if (this.requestChunks.length > 0) {
      this.requestChunks.forEach((chunk) => socket.write(chunk))
    }

    socket
      .once('connect', () => this.emit('connect'))
      .once('ready', () => {
        this.emit('ready')
        socket.on('data', (chunk) => {
          this.emit('data', chunk)
        })
      })
      .on('error', (error) => this.emit('error', error))
      .on('timeout', () => this.emit('timeout'))
      .on('drain', () => this.emit('drain'))
      .on('close', (hadError) => this.emit('close', hadError))
      .on('end', () => this.emit('end'))
  }

  public async respondWith(response: Response): Promise<void> {
    this.emit('resume')
    await pipeResponse(response, this)

    // If the request did not specify the "Connection" header,
    // the socket will be kept alive. We mustn't close its
    // readable stream in that case as more clients can write to it.
    if (!this.shouldKeepAlive) {
      /**
       * Socket (I suspect the underlying stream) emits the
       * "readable" event for non-keepalive connections
       * before closing them. If you are a magician who knows
       * why it does so, let us know if we're doing it right here.
       */
      this.emit('readable')
      this.push(null)
    }
  }

  public errorWith(error?: Error): void {
    Reflect.set(this, '_hadError', true)
    this.emit('error', error)
    this.emit('close', true)
  }
}

type CommonSocketConnectOptions = {
  method?: string
  auth?: string
  noDelay?: boolean
  encoding?: BufferEncoding | null
  servername?: string
}

type NormalizedSocketConnectOptions =
  | (CommonSocketConnectOptions & URL)
  | (CommonSocketConnectOptions & {
      host: string
      port: number
      path?: string | null
    })

type HttpMessageParserMessageType = 'request' | 'response'
interface HttpMessageParserCallbacks<T extends HttpMessageParserMessageType> {
  onHeadersComplete?: T extends 'request'
    ? (
        versionMajor: number,
        versionMinor: number,
        headers: Array<string>,
        idk: number,
        path: string,
        idk2: unknown,
        idk3: unknown,
        idk4: unknown,
        shouldKeepAlive: boolean
      ) => void
    : (
        versionMajor: number,
        versionMinor: number,
        headers: Array<string>,
        method: string | undefined,
        url: string | undefined,
        status: number,
        statusText: string,
        upgrade: boolean,
        shouldKeepAlive: boolean
      ) => void
  onBody?: (chunk: Buffer) => void
  onMessageComplete?: () => void
}

class HttpMessageParser<T extends HttpMessageParserMessageType> {
  private parser: HTTPParser

  constructor(messageType: T, callbacks: HttpMessageParserCallbacks<T>) {
    this.parser = new HTTPParser()
    this.parser.initialize(
      messageType === 'request' ? HTTPParser.REQUEST : HTTPParser.RESPONSE,
      // Don't create any async resources here.
      // This has to be "HTTPINCOMINGMESSAGE" in practice.
      // @see https://github.com/nodejs/llhttp/issues/44#issuecomment-582499320
      // new HTTPServerAsyncResource('INTERCEPTORINCOMINGMESSAGE', socket)
      {}
    )
    this.parser[HTTPParser.kOnHeadersComplete] = callbacks.onHeadersComplete
    this.parser[HTTPParser.kOnBody] = callbacks.onBody
    this.parser[HTTPParser.kOnMessageComplete] = callbacks.onMessageComplete
  }

  public push(chunk: Buffer): void {
    this.parser.execute(chunk)
  }

  public destroy(): void {
    this.parser.finish()
    this.parser.free()
  }
}

function parseSocketConnectionUrl(
  options: NormalizedSocketConnectOptions
): URL {
  if ('href' in options) {
    return new URL(options.href)
  }

  const protocol = options.port === 443 ? 'https:' : 'http:'
  const host = options.host

  const url = new URL(`${protocol}//${host}`)

  if (options.port) {
    url.port = options.port.toString()
  }

  if (options.path) {
    url.pathname = options.path
  }

  if (options.auth) {
    const [username, password] = options.auth.split(':')
    url.username = username
    url.password = password
  }

  return url
}

function parseRawHeaders(rawHeaders: Array<string>): Headers {
  const headers = new Headers()
  for (let line = 0; line < rawHeaders.length; line += 2) {
    headers.append(rawHeaders[line], rawHeaders[line + 1])
  }
  return headers
}

/**
 * Pipes the entire HTTP message from the given Fetch API `Response`
 * instance to the socket.
 */
async function pipeResponse(
  response: Response,
  socket: net.Socket
): Promise<void> {
  const httpHeaders: Array<Buffer> = []
  // Status text is optional in Response but required in the HTTP message.
  const statusText = response.statusText || STATUS_CODES[response.status] || ''

  httpHeaders.push(Buffer.from(`HTTP/1.1 ${response.status} ${statusText}\r\n`))

  for (const [name, value] of response.headers) {
    httpHeaders.push(Buffer.from(`${name}: ${value}\r\n`))
  }

  if (!response.body) {
    socket.push(Buffer.concat(httpHeaders))
    return
  }

  httpHeaders.push(Buffer.from('\r\n'))

  const encoding = response.headers.get('content-encoding') as
    | BufferEncoding
    | undefined
  const reader = response.body.getReader()

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    // Send the whole HTTP message headers buffer,
    // including the first body chunk at once. This will
    // be triggered for all non-stream response bodies.
    if (httpHeaders.length > 0) {
      httpHeaders.push(Buffer.from(value))
      socket.push(Buffer.concat(httpHeaders))
      httpHeaders.length = 0
      continue
    }

    // If the response body keeps streaming,
    // pipe it to the socket as we receive the chunks.
    socket.push(value, encoding)
  }

  reader.releaseLock()
}
