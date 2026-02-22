import net from 'node:net'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { kMockState, kTlsSocket, MockSocket } from './mock-socket'
import { unwrapPendingData } from './utils/flush-writes'

// Internally, Node.js represents the result of various operations
// by the number they return: 0 (error), 1 (success).
type OperationStatus = 0 | 1

declare module 'node:net' {
  interface Socket {
    _pendingData:
      | string
      | Buffer
      | Array<{
          chunk: string | Buffer
          encoding?: BufferEncoding
          callback?: (error?: Error | null) => void
        }>
      | null
    _pendingEncoding: BufferEncoding | null
    _writeGeneric(
      writev: boolean,
      data: any,
      encoding: BufferEncoding,
      callback?: (error?: Error | null) => void
    ): void
    _handle: TcpHandle
  }
}

declare module 'node:tls' {
  interface TLSSocket {
    _handle: TcpHandle & {
      start: () => void
      onhandshakedone: () => void
      onnewsession: (sessionId: unknown, session: Buffer) => void
      verifyError: () => void
    }
  }
}

export interface TcpHandle {
  open: (fd: unknown) => OperationStatus
  connect: (request: TcpWrap, address: string, port: number) => void
  connect6: (request: TcpWrap, address: string, port: number) => void
  listen: (backlog: number) => OperationStatus
  onconnection?: () => void
  getpeername?: () => OperationStatus
  getsockname?: () => OperationStatus
  reading: boolean
  onread: () => void
  readStart: () => void
  readStop: () => void
  bytesRead: number
  bytesWritten: number
  ref?: () => void
  unref?: () => void
  fchmod: (mode: number) => void
  setBlocking: (blocking: boolean) => OperationStatus
  setNoDelay?: (noDelay: boolean) => void
  setKeepAlive?: (keepAlive: boolean, initialDelay: number) => void
  shutdown: (reqest: unknown /* ShutdownWrap */) => OperationStatus
  close: () => void

  _parent?: TcpHandle
}

export interface TcpWrap {
  oncomplete: (
    status: OperationStatus,
    owner: TcpHandle,
    request: TcpWrap,
    readable?: boolean,
    writable?: boolean
  ) => void
}

export const kRawSocket = Symbol('kRawSocket')

export class ConnectionController {
  #pendingRequest: DeferredPromise<TcpWrap>

  private [kRawSocket]: MockSocket

  constructor(
    socket: MockSocket,
    private readonly createConnection: () => net.Socket
  ) {
    this[kRawSocket] = socket
    this.#pendingRequest = new DeferredPromise<TcpWrap>()

    socket.prependListener('connectionAttempt', () => {
      socket._handle.connect = (request) => {
        this.#pendingRequest.resolve(request)
      }
      socket._handle.connect6 = (request) => {
        this.#pendingRequest.resolve(request)
      }
    })
  }

  /**
   * Wait for the first connection attempt and claim this socket connection.
   * This will transition the socket into a connected state as if the
   * connection with the remote address was successful.
   */
  public claim(): void {
    const clientSocket = this[kRawSocket]
    clientSocket[kMockState] = MockSocket.MOCKED

    console.log('CLAIM!')

    const tlsSocket = clientSocket[kTlsSocket]

    if (tlsSocket) {
      // Update the client socket reference so that connection controller interacts
      // with the top-most socket, which is the TLSSocket. This way, mocked response
      // gets pushed to the TLS socket correctly. Pushing it to TCP does nothing.
      /**
       * @fixme This should be removed after MockTlsSocket is implemented.
       * [kClientSocket] should point to MockTlsSocket from the start, no nesting.
       */
      this[kRawSocket] = tlsSocket

      this.#pendingRequest = new DeferredPromise()

      /**
       * Mock this to prevent the "Error: Worker exited unexpectedly" error.
       * This will trigger when "secure" is emitted.
       * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L1648
       */
      tlsSocket._handle.verifyError = () => void 0

      tlsSocket._handle.start = () => {
        process.nextTick(() => {
          /**
           * Mock successful SSL handshake completion.
           * This will emit "secureConnect" and "secure" on the TLS socket, and trigger "tlsSocket._finishInit".
           * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L878
           */
          tlsSocket._handle.onhandshakedone()
          tlsSocket._handle.onnewsession(1, Buffer.alloc(0))
        })
      }

      clientSocket.connecting = false

      process.nextTick(() => {
        clientSocket.emit('connect')
        tlsSocket.emit('ready')
      })

      return
    }

    // The user can interact with the connection controller *before* the connection attempt
    // is made. That is so they could handle the socket before the connection.
    this.#pendingRequest.then((request) => {
      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, clientSocket._handle, request, true, true)
    })
  }

  public retry(): void {
    throw new Error('Not Implemented')
  }

  public close(): void {
    throw new Error('Not Implemented')
  }

  /**
   * Abort this socket connection with an optional error.
   */
  public errorWith(reason?: Error): void {
    this[kRawSocket].destroy(reason)
  }

  /**
   * Bypass this socket connection and perform it as-is.
   */
  public passthrough(): net.Socket {
    const clientSocket = this[kRawSocket]
    clientSocket[kMockState] = MockSocket.PASSTHROUGH

    const realSocket = this.createConnection()

    if (clientSocket._pendingData) {
      unwrapPendingData(clientSocket._pendingData, (chunk, encoding) => {
        realSocket.write(chunk, encoding)
      })
    }

    clientSocket
      .on('drain', () => realSocket.resume())
      .on('close', () => realSocket.destroy())
    clientSocket._write = (...args) => realSocket.write(...args)
    clientSocket._final = (callback) => realSocket.end(callback)

    realSocket
      .once('connectionAttempt', () => {
        clientSocket._handle.unref?.()
        clientSocket._handle = realSocket._handle
      })
      .on('connect', () => {
        clientSocket.connecting = realSocket.connecting
        clientSocket.emit('connect')
        // clientSocket.emit('ready')
      })
      .on('data', (data) => {
        if (!clientSocket.push(data)) {
          realSocket.pause()
        }
      })
      .on('error', (error) => {
        clientSocket.emit('error', error)
      })
      .on('end', () => {
        clientSocket.push(null)
      })

    /**
     * @todo @fixme Forwarding events is not enough.
     * Real socket has to, effectively, replace the client socket in every sense.
     */

    return realSocket
  }
}
