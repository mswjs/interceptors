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
          console.log('onResponse callback')

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
  private requestParser: typeof HTTPParser
  private requestStream?: Readable
  private responseParser: typeof HTTPParser
  private responseStream?: Readable

  constructor(
    private readonly socket: net.Socket,
    private readonly normalizedOptions: NormalizedSocketConnectOptions,
    callback?: (error?: Error) => void
  ) {
    this.url = parseSocketConnectionUrl(normalizedOptions)

    // Create the parser later on because a single
    // socket can be *reused* for multiple requests.
    // The same way, don't free the parser.
    this.requestParser = new HTTPParser()
    this.requestParser[HTTPParser.kOnHeadersComplete] = (
      verionMajor: number,
      versionMinor: number,
      headers: Array<string>,
      idk: number,
      path: string,
      idk2: undefined,
      idk3: undefined,
      idk4: boolean
    ) => {
      this.onRequestStart(path, headers)
    }
    this.requestParser[HTTPParser.kOnBody] = (chunk: Buffer) => {
      this.onRequestData(chunk)
    }
    this.requestParser[HTTPParser.kOnMessageComplete] = () => {
      this.onRequestEnd()
    }
    this.requestParser.initialize(HTTPParser.REQUEST, {})

    this.responseParser = new HTTPParser()
    this.responseParser[HTTPParser.kOnHeadersComplete] = (
      verionMajor: number,
      versionMinor: number,
      headers: Array<string>,
      method: string | undefined,
      url: string | undefined,
      status: number,
      statusText: string,
      upgrade: boolean,
      shouldKeepAlive: boolean
    ) => {
      this.onResponseStart(status, statusText, headers)
    }
    this.responseParser[HTTPParser.kOnBody] = (chunk: Buffer) => {
      this.onResponseData(chunk)
    }
    this.responseParser[HTTPParser.kOnMessageComplete] = () => {
      this.onResponseEnd()
    }
    this.responseParser.initialize(
      HTTPParser.RESPONSE,
      // Don't create any async resources here.
      // This has to be "HTTPINCOMINGMESSAGE" in practice.
      // @see https://github.com/nodejs/llhttp/issues/44#issuecomment-582499320
      // new HTTPServerAsyncResource('INTERCEPTORINCOMINGMESSAGE', socket)
      {}
    )

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
            this.suppressedEvents.push(['error', args.slice(1)])
            return true
          }

          // Suppress close events for errored mocked connections.
          if (args[0] === 'close') {
            this.suppressedEvents.push(['close', args.slice(1)])
            return true
          }
        }

        return Reflect.apply(target, thisArg, args)
      },
    })

    socket.once('ready', () => {
      // Notify the interceptor once the socket is ready.
      // The HTTP parser triggers BEFORE that.
      this.onRequest(this.request)
    })

    // Intercept the outgoing (request) data.
    socket.write = new Proxy(socket.write, {
      apply: (target, thisArg, args) => {
        if (args[0] !== null) {
          this.requestParser.execute(
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
          this.responseParser.execute(
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
    if (this.suppressedEvents.length === 0) {
      return
    }

    for (const [event, ...args] of this.suppressedEvents) {
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
    this.requestParser.free()

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
    this.onResponse(response)
  }

  private onResponseData(chunk: Buffer) {
    invariant(
      this.responseStream,
      'Failed to push the chunk to the response stream: response stream is missing'
    )
    this.responseStream.push(chunk)
  }

  private onResponseEnd() {
    this.responseParser.free()

    invariant(
      this.responseStream,
      'Failed to handle the response end: response stream is missing'
    )
    this.responseStream.push(null)
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

// MOCKED REQUEST:
// 1. lookup // mock that's OK
// 2. connect
// 3. ready
// HAS MOCK?
// -> Y: data -> close
// -> N (no response, non-existing host):
//   -> replayErrors()
//     -> lookup (error), error, close

// BYPASSED REQUEST TO EXISTING HOST:
// 1. lookup (no errors)
// 2. (skip mockConnect), forward all socket events.
// 3. emit "request" on the interceptor.
// 4. HAS MOCK?
//  -> Y: respondWith: data -> close
//  -> N: do nothing
