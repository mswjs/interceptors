import net from 'node:net'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { invariant } from 'outvariant'
import { kMockState, MockSocket } from './mock-socket'
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

interface TcpHandle {
  open: (fd: unknown) => OperationStatus
  connect: (request: TcpWrap, address: string, port: number) => void
  listen: (backlog: number) => OperationStatus
  onconnection?: () => void
  getpeername?: () => OperationStatus
  getsockname?: () => OperationStatus
  reading: boolean
  onread: () => {}
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
}

interface TcpWrap {
  oncomplete: (
    status: OperationStatus,
    owner: TcpHandle,
    request: TcpWrap,
    readable?: boolean,
    writable?: boolean
  ) => void
}

export const kClientSocket = Symbol('kClientSymbol')

export class ConnectionController {
  #pendingRequest: DeferredPromise<TcpWrap>

  private [kClientSocket]: MockSocket

  constructor(
    socket: MockSocket,
    private readonly createConnection: () => net.Socket
  ) {
    this[kClientSocket] = socket
    this.#pendingRequest = new DeferredPromise<TcpWrap>()

    invariant(
      socket._handle,
      'Failed to create a socket connection controller: socket._handle is missing'
    )

    socket._handle.connect = (request) => {
      this.#pendingRequest.resolve(request)
    }

    /**
     * @todo @fixme Also patch "socket._handle.connect6" for IPv6 connections.
     * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
     */
  }

  /**
   * Wait for the first connection attempt and claim this socket connection.
   * This will transition the socket into a connected state as if the
   * connection with the remote address was successful.
   */
  public claim(): void {
    this[kClientSocket][kMockState] = MockSocket.MOCKED

    // The user can interact with the connection controller *before* the connection attempt
    // is made. That is so they could handle the socket before the connection.
    this.#pendingRequest.then((request) => {
      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, this[kClientSocket]._handle, request, true, true)
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
    this[kClientSocket].destroy(reason)
  }

  /**
   * Bypass this socket connection and perform it as-is.
   */
  public passthrough(): net.Socket {
    const clientSocket = this[kClientSocket]
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
