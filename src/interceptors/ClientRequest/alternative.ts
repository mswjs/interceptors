import net from 'net'
import tls from 'tls'
import http from 'http'
import { Duplex } from 'stream'
import { invariant } from 'outvariant'
import { ClientRequestEmitter } from '.'

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
        let requestBuffer = Buffer.from([])

        serverSide.on('data', (chunk) => {
          requestBuffer = Buffer.concat([requestBuffer, chunk])
        })

        clientSide.on('data', (chunk) =>
          console.log('[client] data:', chunk.toString('utf8'))
        )
        clientSide.once('end', () => console.log('[client] end'))

        serverSide.on('data', (data) => {
          console.log('server data:', data.toString())
        })
        serverSide.on('end', () => console.error('server end'))

        // The second tick is when the server should respond.
        process.nextTick(() => {
          serverSide.write(`\
HTTP/1.1 301 Moved Permanently\r
Content-Type: text/plain\r
\r
different-response`)

          serverSide.end()
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

  //       http._connectionListener.call(
  //         request,
  //         // @ts-expect-error
  //         socket[kOtherSide]
  //       )

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
