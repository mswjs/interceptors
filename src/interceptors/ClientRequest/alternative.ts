import net from 'net'
import tls from 'tls'
import http from 'http'
import { Duplex } from 'stream'
import { invariant } from 'outvariant'
import { ClientRequestEmitter } from '.'
import { InteractiveIsomorphicRequest, IsomorphicRequest } from '../../glossary'
import { Headers } from 'headers-polyfill/lib'
import { createLazyCallback } from '../../utils/createLazyCallback'
import { until } from '@open-draft/until'

declare module 'stream' {
  interface Duplex {
    _writableState: { finished: boolean }
    onread(data?: unknown): void
  }
}

declare module 'net' {
  interface Socket {
    _serverSocket: net.Socket
  }
}

declare module 'http' {
  export const _connectionListener: (socket: net.Socket) => void
}

const originalSocketConnect = net.Socket.prototype.connect
const originalSocketWrite = net.Socket.prototype.write
const originalTlsSocketConnect = tls.TLSSocket.prototype.connect
const originalOnSocket = http.ClientRequest.prototype.onSocket

export function alternative(emitter: ClientRequestEmitter) {
  /**
   * @see https://github.com/nodejs/node/blob/bc5f9e1a35623d65d9808993adb367024d60d63b/lib/net.js#L1007
   */
  net.Socket.prototype.connect = new Proxy(net.Socket.prototype.connect, {
    apply(
      target,
      socket: net.Socket,
      args: [net.SocketConnectOpts, () => void]
    ) {
      const [socketOptions, listener] = args
      const { clientSide, serverSide } = new DuplexPair()

      async function lookupResponse(): Promise<void> {
        const requestBufferChunks: Buffer[] = []

        await new Promise<void>((resolve) => {
          serverSide.on('data', function (this: any, chunk, ...args: any[]) {
            const data = chunk.toString('utf8')

            if (data === '\r\n' || data === '7') {
              return
            }

            // The request body is finished when "0" is sent.
            if (data === '0\r\n\r\n') {
              return resolve()
            }

            requestBufferChunks.push(chunk)
          })
        })

        let requestBuffer = Buffer.concat(requestBufferChunks.slice(1))

        process.nextTick(async () => {
          const request = (clientSide as any)._httpMessage as http.ClientRequest

          // Read request headers.
          const outgoingHeaders = request.getHeaders()
          const requestHeaders = new Headers()
          for (const [headerName, headerValue] of Object.entries(
            outgoingHeaders
          )) {
            if (!headerValue) {
              continue
            }
            requestHeaders.set(headerName.toLowerCase(), headerValue.toString())
          }

          const isomorphicRequest: IsomorphicRequest = {
            id: 'abc-123',
            method: request.method,
            url: new URL(request.path, `${request.protocol}//${request.host}`),
            headers: requestHeaders,
            credentials: 'same-origin',
            body: requestBuffer.toString('utf8'),
          }
          const interactiveIsomorphicRequest: InteractiveIsomorphicRequest = {
            ...isomorphicRequest,
            respondWith: createLazyCallback({
              maxCalls: 1,
              maxCallsCallback() {
                throw new Error('Already responded to')
              },
            }),
          }

          console.log('request:', isomorphicRequest)
          emitter.emit('request', interactiveIsomorphicRequest)

          const [resolverException, mockedResponse] = await until(async () => {
            await emitter.untilIdle('request', ({ args: [request] }) => {
              return request.id === isomorphicRequest.id
            })

            const [mockedResponse] =
              await interactiveIsomorphicRequest.respondWith.invoked()
            return mockedResponse
          })

          if (resolverException) {
            console.error('emulate response error')
            return
          }

          if (mockedResponse) {
            console.warn('respond with mock', mockedResponse)

            serverSide.write(
              `HTTP/1.1 ${mockedResponse.status} ${mockedResponse.statusText}\r\n`
            )

            if (mockedResponse.headers) {
              for (const [headerName, headerValue] of Object.entries(
                mockedResponse.headers
              )) {
                serverSide.write(`${headerName}: ${headerValue}\r\n`)
              }
            }

            if (mockedResponse.body) {
              serverSide.write('\r\n')
              serverSide.write(mockedResponse.body)
            }
            serverSide.end()

            return
          }

          console.error('should perform as-is')
        })
      }

      process.nextTick(lookupResponse)
      listener?.()
      return clientSide
    },
  })

  // http.ClientRequest.prototype.onSocket = new Proxy(
  //   http.ClientRequest.prototype.onSocket,
  //   {
  //     apply(target, request: http.ClientRequest, args: [net.Socket]) {
  //       const [socket] = args
  //       console.warn('client request onSocket')

  //       // http._connectionListener.call(
  //       //   request,
  //       //   // @ts-expect-error
  //       //   socket[kOtherSide]
  //       // )
  //       const response = new http.IncomingMessage(socket)

  //       process.nextTick(() => {
  //         request.emit('response', response)
  //         response.statusCode = 302
  //         response.push('hello world')
  //         response.push(null)
  //         response.emit('end')
  //       })

  //       return Reflect.apply(target, request, args)
  //     },
  //   }
  // )

  return () => {
    net.Socket.prototype.connect = originalSocketConnect
    net.Socket.prototype.write = originalSocketWrite
    tls.TLSSocket.prototype.connect = originalTlsSocketConnect
    http.ClientRequest.prototype.onSocket = originalOnSocket
  }
}

//
//
//

const kOtherSide = Symbol('kOtherSide')
const kCallback = Symbol('kCallback')

class DuplexSocket extends Duplex {
  private [kOtherSide]?: DuplexSocket
  private [kCallback]?: () => void

  _read() {
    const callback = this[kCallback]
    if (callback) {
      this[kCallback] = undefined
      callback()
    }
  }

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: () => void
  ) {
    const otherSide = this[kOtherSide]
    invariant(otherSide, 'Must have other side')

    if (chunk.length === 0) {
      process.nextTick(callback)
    } else {
      otherSide.push(chunk)
      otherSide[kCallback] = callback
    }
  }

  _final(callback: () => void): void {
    const otherSide = this[kOtherSide]
    invariant(otherSide, 'Must have other side')
    otherSide.on('end', callback)
    otherSide.push(null)
  }
}

class DuplexPair {
  public clientSide: DuplexSocket
  public serverSide: DuplexSocket

  constructor() {
    this.clientSide = new DuplexSocket()
    this.serverSide = new DuplexSocket()
    this.clientSide[kOtherSide] = this.serverSide
    this.serverSide[kOtherSide] = this.clientSide
  }
}
