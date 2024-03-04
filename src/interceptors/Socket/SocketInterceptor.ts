import net from 'node:net'
import { HTTPParser } from 'node:_http_common'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { invariant } from 'outvariant'
import { until } from '@open-draft/until'
import { Interceptor } from '../../Interceptor'
import {
  InteractiveRequest,
  toInteractiveRequest,
} from '../../utils/toInteractiveRequest'
import { emitAsync } from '../../utils/emitAsync'

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

    net.Socket.prototype.connect = function (normalizedOptions) {
      const socket = originalConnect.apply(this, normalizedOptions as any)
      const controller = new SocketController(socket, ...normalizedOptions)

      controller.onRequest = (request) => {
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

        until(async () => {
          await emitAsync(self.emitter, 'request', {
            request: interactiveRequest,
            requestId,
          })

          const mockedResponse = await requestController.responsePromise
          return mockedResponse
        }).then((resolverResult) => {
          if (resolverResult.error) {
            socket.emit('error', resolverResult.error)
            return
          }

          const mockedResponse = resolverResult.data

          if (mockedResponse) {
            controller.respondWith(mockedResponse)
            return
          }

          controller.passthrough()
        })

        // Otherwise, listen to the original response
        // and forward it to the interceptor.
        controller.onResponse = (response, isMockedResponse) => {
          self.emitter.emit('response', {
            requestId,
            request,
            response,
            isMockedResponse,
          })
        }
      }

      return socket
    }

    this.subscriptions.push(() => {
      net.Socket.prototype.connect = originalConnect
    })
  }
}

type CommonSocketConnectOptions = {
  method?: string
  auth?: string
  noDelay: boolean
  encoding: BufferEncoding | null
  servername: string
}

type NormalizedSocketConnectOptions =
  | (CommonSocketConnectOptions & URL)
  | (CommonSocketConnectOptions & {
      host: string
      port: number
      path: string | null
    })

class SocketController {
  public onRequest: (request: Request) => void = () => null
  public onResponse: (response: Response, isMockedResponse: boolean) => void =
    () => null

  private url: URL
  private shouldSuppressEvents = false
  private suppressedEvents: Array<[event: string, ...args: Array<unknown>]> = []
  private request: Request
  private requestStream?: Readable
  private responseStream?: Readable

  constructor(
    private readonly socket: net.Socket,
    private readonly normalizedOptions: NormalizedSocketConnectOptions,
    callback?: (error?: Error) => void
  ) {
    this.url = parseSocketConnectionUrl(normalizedOptions)

    const requestParser = new HttpMessageParser('request', {
      onHeadersComplete: (major, minor, headers, _, path) => {
        this.onRequestStart(path, headers)
      },
      onBody: (chunk) => {
        this.onRequestData(chunk)
      },
      onMessageComplete: this.onRequestEnd.bind(this),
    })

    const responseParser = new HttpMessageParser('response', {
      onHeadersComplete: (
        versionMajor,
        versionMinor,
        headers,
        method,
        url,
        status,
        statusText,
        upgrade,
        keepalive
      ) => {
        this.onResponseStart(status, statusText, headers)
      },
      onBody: (chunk) => {
        this.onResponseData(chunk)
      },
      onMessageComplete: this.onResponseEnd.bind(this),
    })

    socket.emit = new Proxy(socket.emit, {
      apply: (target, thisArg, args) => {
        // The lookup phase will error first when requesting
        // non-existing address. If that happens, switch to
        // the mock mode and emulate successful connection.
        if (args[0] === 'lookup' && args[1] instanceof Error) {
          this.shouldSuppressEvents = true
          this.mockConnect(callback)
          return true
        }

        if (this.shouldSuppressEvents) {
          if (args[0] === 'error') {
            Reflect.set(this.socket, '_hadError', false)
            this.suppressedEvents.push(['error', ...args.slice(1)])
            return true
          }

          // Suppress close events for errored mocked connections.
          if (args[0] === 'close') {
            this.suppressedEvents.push(['close', ...args.slice(1)])
            return true
          }
        }

        return Reflect.apply(target, thisArg, args)
      },
    })

    socket.once('connect', () => {
      // Notify the interceptor once the socket is ready.
      // The HTTP parser triggers BEFORE that.
      this.onRequest(this.request)
    })

    // Intercept the outgoing (request) data.
    socket.write = new Proxy(socket.write, {
      apply: (target, thisArg, args) => {
        if (args[0] !== null) {
          requestParser.push(
            Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0])
          )
        }
        return Reflect.apply(target, thisArg, args)
      },
    })

    // Intercept the incoming (response) data.
    socket.push = new Proxy(socket.push, {
      apply: (target, thisArg, args) => {
        if (args[0] !== null) {
          responseParser.push(
            Buffer.isBuffer(args[0]) ? args[0] : Buffer.from(args[0])
          )
        }
        return Reflect.apply(target, thisArg, args)
      },
    })
  }

  private mockConnect(callback?: (error?: Error) => void) {
    this.socket.emit('lookup', null, '::1', 6, '')

    Reflect.set(this.socket, 'connecting', false)
    // Don't forger about "secureConnect" for TLS connections.
    this.socket.emit('connect')
    callback?.()

    this.socket.emit('ready')
  }

  public async respondWith(response: Response): Promise<void> {
    this.onResponse(response, true)

    this.socket.push(`HTTP/1.1 ${response.status} ${response.statusText}\r\n`)

    for (const [name, value] of response.headers) {
      this.socket.push(`${name}: ${value}\r\n`)
    }

    if (response.body) {
      this.socket.push('\r\n')

      const reader = response.body.getReader()
      const readNextChunk = async () => {
        const { done, value } = await reader.read()

        if (done) {
          this.socket.push(null)
          return
        }

        this.socket.push(value)
        await readNextChunk()
      }

      readNextChunk()
      return
    }

    this.socket.push(null)
  }

  public async passthrough(): Promise<void> {
    this.shouldSuppressEvents = false
    this.replayErrors()
  }

  private replayErrors() {
    console.log('replay errors...', this.suppressedEvents)

    if (this.suppressedEvents.length === 0) {
      return
    }

    for (const [event, ...args] of this.suppressedEvents) {
      console.log('replaying event', event, ...args)

      if (event === 'error') {
        Reflect.set(this.socket, '_hadError', true)
      }

      this.socket.emit(event, ...args)
    }
  }

  private onRequestStart(path: string, rawHeaders: Array<string>) {
    // Depending on how the request object is constructed,
    // its path may be available only from the parsed HTTP message.
    const url = new URL(path, this.url)
    const headers = parseRawHeaders(rawHeaders)

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

    this.requestStream = new Readable()
    const method = this.normalizedOptions.method || 'GET'
    const methodWithBody = method !== 'HEAD' && method !== 'GET'

    this.request = new Request(url, {
      method,
      headers,
      body: methodWithBody ? Readable.toWeb(this.requestStream) : null,
      // @ts-expect-error Not documented fetch property.
      duplex: methodWithBody ? 'half' : undefined,
      credentials: 'same-origin',
    })
  }

  private onRequestData(chunk: Buffer) {
    invariant(
      this.requestStream,
      'Failed to push the chunk to the request stream: request stream is missing'
    )
    this.requestStream.push(chunk)
  }

  private onRequestEnd() {
    invariant(
      this.requestStream,
      'Failed to handle the request end: request stream is missing'
    )
    this.requestStream.push(null)
  }

  private onResponseStart(
    status: number,
    statusText: string,
    rawHeaders: Array<string>
  ) {
    this.responseStream = new Readable()
    const response = new Response(Readable.toWeb(this.responseStream), {
      status,
      statusText,
      headers: parseRawHeaders(rawHeaders),
    })
    this.onResponse(response, false)
  }

  private onResponseData(chunk: Buffer) {
    invariant(
      this.responseStream,
      'Failed to push the chunk to the response stream: response stream is missing'
    )
    this.responseStream.push(chunk)
  }

  private onResponseEnd() {
    invariant(
      this.responseStream,
      'Failed to handle the response end: response stream is missing'
    )
    this.responseStream.push(null)
  }
}

type HttpMessageParserMessageType = 'request' | 'response'
interface HttpMessageParserCallbacks<T extends HttpMessageParserMessageType> {
  onHeadersComplete?: T extends 'request'
    ? (
        versionMajor: number,
        versionMinor: number,
        headers: Array<string>,
        idk: number,
        path: string
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
    this.parser[HTTPParser.kOnMessageComplete] = callbacks.onMessageComplete
  }

  public push(chunk: Buffer): void {
    this.parser.execute(chunk)
  }

  public destroy(): void {
    this.parser.free()
  }
}

function parseSocketConnectionUrl(
  options: NormalizedSocketConnectOptions
): URL {
  if ('href' in options) {
    return new URL(options.href)
  }

  const url = new URL(`http://${options.host}`)

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
