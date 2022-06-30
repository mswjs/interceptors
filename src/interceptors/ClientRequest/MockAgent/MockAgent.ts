import {
  Agent,
  IncomingMessage,
  ClientRequest,
  RequestOptions,
  STATUS_CODES,
} from 'http'
import { Socket } from 'net'
import { debug } from 'debug'
import { Headers } from 'headers-polyfill/lib'
import { until } from '@open-draft/until'
import { DuplexPair, DuplexSocket, kOtherSide } from './DuplexPair'
import { uuidv4 } from '../../../utils/uuid'
import {
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
  MockedResponse,
} from '../../../glossary'
import { DeferredPromise } from '../../../utils/deferredPromise'
import { createLazyCallback } from '../../../utils/createLazyCallback'
import type { ClientRequestEmitter } from '..'

const log = debug('mock-agent')

export class MockAgent implements Agent {
  public readonly requests: Record<string, IncomingMessage[]>
  public readonly sockets: Record<string, Socket[]>
  public readonly freeSockets: Record<string, Socket[]>
  public maxSockets: number
  public maxFreeSockets: number
  public maxTotalSockets: number

  private readers: Record<string, RequestBodyReader>

  constructor(private readonly emitter: ClientRequestEmitter) {
    this.requests = {}
    this.sockets = {}
    this.freeSockets = {}
    this.maxSockets = Infinity
    this.maxFreeSockets = Infinity
    this.maxTotalSockets = Infinity
    this.readers = {}

    log('constructed')
  }

  addRequest(request: ClientRequest, options: RequestOptions) {
    log('add request', request.method, request.path)

    const requestId = uuidv4()
    this.readers[requestId] = new RequestBodyReader(request)

    const sockets = this.createDuplexPair()
    request.onSocket(sockets.clientSide as unknown as Socket)

    // Handle the request on the next tick so that the request
    // has a chance to send its headers/body on the current one.
    process.nextTick(() => this.handleRequest(requestId, request))
  }

  private createDuplexPair(): DuplexPair {
    log('create a duplex pair')

    const pairId = uuidv4()
    const sockets = new DuplexPair()
    this.sockets[pairId] = [
      sockets.clientSide as unknown as Socket,
      sockets.serverSide as unknown as Socket,
    ]

    return sockets
  }

  private async handleRequest(
    requestId: string,
    request: ClientRequest
  ): Promise<void> {
    log('looking up a mocked response...')

    const clientSide = request.socket as any as DuplexSocket
    const serverSide = clientSide[kOtherSide] as DuplexSocket

    const isomorpicRequest = await this.toIsomorphicRequest(requestId, request)
    log('isomorphic request:', isomorpicRequest)

    const interactiveIsomorphicRequest: InteractiveIsomorphicRequest = {
      ...isomorpicRequest,
      respondWith: createLazyCallback({
        maxCalls: 1,
        maxCallsCallback() {
          throw new Error('Request already responded to')
        },
      }),
    }

    const [listenerException, mockedResponse] = await until(async () => {
      this.emitter.emit('request', interactiveIsomorphicRequest)

      await this.emitter.untilIdle('request', ({ args: [request] }) => {
        return request.id === isomorpicRequest.id
      })

      const [mockedResponse] =
        await interactiveIsomorphicRequest.respondWith.invoked()
      return mockedResponse
    })

    if (listenerException) {
      request.emit('error', listenerException)
      return
    }

    if (mockedResponse) {
      this.respondUsingSocket(serverSide, mockedResponse)
      return
    }

    throw new Error('NotImplemented: Perform as-is')
  }

  private async toIsomorphicRequest(
    requestId: string,
    request: ClientRequest
  ): Promise<IsomorphicRequest> {
    const url = new URL(request.path, `${request.protocol}//${request.host}`)
    const headers = new Headers()

    for (const headerName of request.getHeaderNames()) {
      const headerValue = request.getHeader(headerName)

      if (!headerValue) {
        continue
      }

      headers.set(headerName.toLowerCase(), headerValue.toString())
    }

    // Retrieve the request body as a buffer once
    // it has been fully written (the "end" has been called.)
    const bodyBuffer = await this.readers[requestId].done

    return {
      id: requestId,
      method: request.method,
      url,
      headers,
      credentials: 'same-origin',
      body: bodyBuffer.toString(),
    }
  }

  private respondUsingSocket(
    serverSide: DuplexSocket,
    response: MockedResponse
  ): void {
    log('respond with:', response)

    const status = response.status || 200
    const statusText = response.statusText || STATUS_CODES[status]

    serverSide.write(`HTTP/1.1 ${status} ${statusText}\r\n`)

    if (response.headers) {
      for (const headerName in response.headers) {
        serverSide.write(`${headerName}: ${response.headers[headerName]}\r\n`)
      }
    }

    // HTTP response message must end either with a blank line
    // or a response body. Otherwise results in "socket hang up"
    // while inable to parse the message.
    serverSide.write('\r\n')

    if (response.body) {
      serverSide.write(response.body)
    }

    serverSide.end()
    log('mocked response finished!')
  }

  destroy(error?: Error) {
    log('destroy', arguments)

    for (const sockets of Object.values(this.sockets)) {
      for (const socket of sockets) {
        socket.destroy(error)
      }
    }
  }
}

class RequestBodyReader {
  private readPromise: DeferredPromise<Buffer>
  private requestBody: Buffer[]
  private pureWrite: typeof ClientRequest.prototype.write
  private pureEnd: typeof ClientRequest.prototype.end

  constructor(private readonly request: ClientRequest) {
    this.readPromise = new DeferredPromise()
    this.requestBody = []
    this.pureWrite = request.write
    this.pureEnd = request.end

    this.readStart()
  }

  get done() {
    return this.readPromise.promise
  }

  private readStart(): void {
    const self = this

    // Read the request body by proxying the "write"/"end" methods
    // because reading it in "serverSide.on('data')" is too low-level
    // and requires you to parse the raw HTTP request message which is
    // a bad idea to do without a designated parser.
    this.request.write = new Proxy(this.request.write, {
      apply(target, thisArg, args) {
        const [chunk, encoding] = args

        self.requestBody.push(Buffer.from(chunk, encoding))

        return Reflect.apply(target, thisArg, args)
      },
    })

    this.request.end = new Proxy(this.request.end, {
      apply(target, thisArg, args) {
        const [chunk] = args

        if (chunk != null) {
          self.requestBody.push(Buffer.from(chunk))
        }

        self.readStop()

        return Reflect.apply(target, thisArg, args)
      },
    })
  }

  private readStop(): void {
    this.readPromise.resolve(Buffer.concat(this.requestBody))
    this.request.write = this.pureWrite
    this.request.end = this.pureEnd
  }
}
