import net from 'node:net'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { NewMockSocket } from './mocker-socket'

// Internally, Node.js represents the result of various operations
// by the number they return: 0 (error), 1 (success).
type OperationStatus = 0 | 1

declare module 'node:net' {
  interface Socket {
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

export class ConnectionController {
  #pendingRequest: DeferredPromise<TcpWrap>

  constructor(private readonly socket: NewMockSocket) {
    this.#pendingRequest = new DeferredPromise<TcpWrap>()

    socket.prependListener('connectionAttempt', (ip, port, family) => {
      /**
       * @todo @fixme Also patch "socket._handle.connect6" for IPv6 connections.
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      if (family === 6) {
        throw new Error(
          'IPv6 connections not implemented (implement "socket._handle.connect6'
        )
      }

      socket._handle.connect = (request) => {
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
    /**
     * The controller exposes the socket to the user *before* the connection attempt
     * is made. That is so the user can handle the socket before connection happens.
     */
    this.#pendingRequest.then((request) => {
      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, this.socket._handle, request, true, true)
    })
  }

  public retry(): void {
    throw new Error('Not Implemented')
  }

  public close(): void {
    throw new Error('Not Implemented')
  }

  public errorWith(reason?: Error): void {
    this.socket.destroy(reason)
  }

  public passthrough(): net.Socket {
    throw new Error('Not Implemented')
  }
}
