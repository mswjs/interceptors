import * as http from 'http'
import * as net from 'net'
import { Headers } from 'headers-polyfill/lib'
import { until } from '@open-draft/until'
import {
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
  MockedResponse,
} from '../../../glossary'
import { DuplexPair } from './DuplexPair'
import { RequestBodyReader } from './RequestBodyReader'
import { uuidv4 } from '../../../utils/uuid'
import { createLazyCallback } from '../../../utils/createLazyCallback'
import { ClientRequestEmitter } from '..'

export class RequestHandler {
  private sockets: DuplexPair
  private reader: RequestBodyReader

  constructor(
    private readonly request: http.ClientRequest,
    private readonly options: http.RequestOptions,
    private readonly emitter: ClientRequestEmitter,
    private readonly passthrough: () => http.ClientRequest
  ) {
    this.sockets = new DuplexPair()
    this.reader = new RequestBodyReader(this.request)
  }

  public handle(): void {
    this.request.onSocket(this.sockets.clientSide as any)
    process.nextTick(() => this.nextHandle())
  }

  private async nextHandle(): Promise<void> {
    const isomorpicRequest = await this.toIsomorphicRequest()
    const interactiveIsomorphicRequest: InteractiveIsomorphicRequest = {
      ...isomorpicRequest,
      respondWith: createLazyCallback({
        maxCalls: 1,
        maxCallsCallback() {
          throw new Error('Request already responded to')
        },
      }),
    }

    console.warn('>', isomorpicRequest)

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
      this.request.emit('error', listenerException)
      return
    }

    if (mockedResponse) {
      this.respondWith(mockedResponse)
      return
    }

    console.log('> perform as-is', { listenerException, mockedResponse })

    this._passthrough()
  }

  private async toIsomorphicRequest(): Promise<IsomorphicRequest> {
    const { request } = this

    const id = uuidv4()
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
    const bodyBuffer = await this.reader.done

    return {
      id,
      method: request.method,
      url,
      headers,
      credentials: 'same-origin',
      body: bodyBuffer.toString(),
    }
  }

  private respondWith(response: MockedResponse): void {
    const { serverSide } = this.sockets

    const status = response.status || 200
    const statusText = response.statusText || http.STATUS_CODES[status]

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
  }

  private _passthrough(): void {
    const request = this.passthrough()

    request.once('socket', (socket) => {
      socket.pipe(this.sockets.serverSide)

      socket.on('data', console.warn)

      socket.once('error', console.error)
      socket.once('timeout', console.error)

      socket.once('connect', () => {
        console.log('socket connected', socket.remoteAddress, socket.remotePort)
      })
    })

    // request.on('response', (res) => {
    //   console.log('res!', res.statusCode, res.statusMessage)
    //   this.request.emit('response', res)
    // })
    request.on('error', this.request.emit.bind(this.request, 'error'))
    request.on('timeout', console.error)
  }

  public destroy(): void {
    this.sockets.clientSide.destroy()
    this.sockets.serverSide.destroy()
  }
}
