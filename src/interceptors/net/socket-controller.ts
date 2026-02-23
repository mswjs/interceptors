import net from 'node:net'
import tls from 'node:tls'
import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { toBuffer } from '../../utils/bufferUtils'
import { createLogger } from '../../utils/logger'
import { unwrapPendingData } from './utils/flush-writes'

const kListenerWrap = Symbol('kListenerWrap')

export const kRawSocket = Symbol('kRawSocket')

export const kMockState = Symbol('kMockState')
export const kTlsSocket = Symbol('kTlsSocket')

const log = createLogger('MockSocket')

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
    _pendingEncoding: BufferEncoding | ''
    _writeGeneric(
      writev: boolean,
      data: NonNullable<net.Socket['_pendingData']>,
      encoding: BufferEncoding,
      callback?: (error?: Error | null) => void
    ): void
    _handle: TcpHandle
    _start: () => void
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

/**
 * Create a proxy `net.Socket` instance that represents the intercepted socket server-side.
 * This is the reference exposed as `socket` in the connection listener. This proxy allows
 * the user to interact with `socket` from the server's perspective (e.g. `socket.write()`
 * on the server translates to the `socket.push()` on the client).
 */
function toServerSocket<T extends net.Socket>(socket: T): T {
  return new Proxy(socket, {
    get: (target, property, receiver) => {
      const getRealValue = () => {
        return Reflect.get(target, property, receiver)
      }

      if (property === 'on' || property === 'addListener') {
        const realAddListener = getRealValue() as net.Socket['addListener']

        return (event: any, listener: (...args: Array<unknown>) => void) => {
          if (event === 'data') {
            const listenerWrap = (chunk: any, encoding?: BufferEncoding) => {
              listener(toBuffer(chunk, encoding))
            }

            Object.defineProperty(listener, kListenerWrap, {
              enumerable: false,
              writable: false,
              value: listenerWrap,
            })

            socket.on('internal:write', listenerWrap)

            return target
          }

          return realAddListener.call(target, event, listener)
        }
      }

      if (property === 'off' || property === 'removeListener') {
        const realRemoveListener =
          getRealValue() as net.Socket['removeListener']

        return (event: string, listener: any) => {
          if (event === 'data') {
            const listenerWrap = listener[kListenerWrap]

            if (listenerWrap) {
              return realRemoveListener.call(target, event, listenerWrap)
            }
          }

          return realRemoveListener.call(target, event, listener)
        }
      }

      // Push data to the client socket when server "socket.write()" is called.
      if (property === 'write') {
        return (
          chunk: any,
          encoding: BufferEncoding,
          callback: (error?: Error | null) => void
        ) => {
          socket.push(toBuffer(chunk, encoding), encoding)
          callback()
        }
      }

      return getRealValue()
    },
  })
}

export abstract class SocketController {
  static PENDING = 0 as const
  static MOCKED = 1 as const
  static PASSTHROUGH = 2 as const

  protected readyState:
    | typeof SocketController.PENDING
    | typeof SocketController.MOCKED
    | typeof SocketController.PASSTHROUGH

  private [kRawSocket]: net.Socket

  constructor(socket: net.Socket) {
    this[kRawSocket] = socket
    this.readyState = SocketController.PENDING
  }

  public claim(): void {
    invariant(
      this.readyState !== SocketController.MOCKED,
      'Failed to claim a TLS socket: already claimed'
    )

    this.readyState = SocketController.MOCKED
  }

  public abstract errorWith(reason?: Error): void

  public passthrough(): void {
    invariant(
      this.readyState !== SocketController.PASSTHROUGH,
      'Failed to passthrough a TLS socket: already passthrough'
    )

    this.readyState = SocketController.PASSTHROUGH
  }
}

export class TcpSocketController extends SocketController {
  public serverSocket: net.Socket

  protected pendingConnection: DeferredPromise<[TcpWrap, TcpHandle]>

  #realWriteGeneric: net.Socket['_writeGeneric']
  #passthroughSocket: net.Socket | null = null
  #passthroughPausedBuffer: Array<Buffer> = []

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket
  ) {
    super(socket)

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => void 0

    // Store the unpatched write method once so we have access to it between socket state resets.
    this.#realWriteGeneric = this.socket._writeGeneric

    /**
     * @note A single socket can be reused for connections to the same host.
     * When one connection ends, the Agent frees the socket, then uses it
     * to write the next request's HTTP message immediately. Use the "free"
     * event to transition the controller into the pending state so "_writeGeneric"
     * would behave correctly.
     */
    socket
      .on('free', () => this.#reset())
      .on('close', () => {
        this.#passthroughSocket = null
        this.#passthroughPausedBuffer = []
      })

    this.serverSocket = toServerSocket(this.socket)

    this.pendingConnection = new DeferredPromise()
    this.#reset()
  }

  #reset(): void {
    this.readyState = SocketController.PENDING
    this.pendingConnection = new DeferredPromise()

    const wrapHandle = (handle: TcpHandle) => {
      handle.connect = handle.connect6 = (request) => {
        this.pendingConnection.resolve([request, handle])
      }
    }

    if (this.socket._handle) {
      wrapHandle(this.socket._handle)
    } else {
      this.socket.prependOnceListener('connectionAttempt', () => {
        wrapHandle(this.socket._handle)
      })
    }

    this.socket._writeGeneric = (...args) => {
      if (this.readyState === SocketController.PENDING) {
        this.#push(args[1])
        return this.#realWriteGeneric.apply(this.socket, args)
      }

      if (this.readyState === SocketController.MOCKED) {
        /**
         * Handle "_writeGeneric" calls scheduled after the "connect" event.
         * These are writes performed while connecting, and for the mocked socket
         * they must be ignored. There's nowhere to flush them. Calling "_writeGeneric"
         * past this point will result in "Error: write EBADF".
         * @see https://github.com/nodejs/node/blob/main/deps/uv/src/unix/stream.c#L1304-L1305
         */
        if (this.socket._pendingData) {
          this.socket._pendingData = null
          this.socket._pendingEncoding = ''
          return
        }

        this.#push(args[1])
        return
      }

      return this.#realWriteGeneric.apply(this.socket, args)
    }
  }

  /**
   * Push the given data to the server socket.
   * This has no effect on the public-facing socket and is used
   * only for the interceptors to subscribe to "socket.on('data')"
   * before the data is actually written anywhere.
   */
  #push = (data: net.Socket['_pendingData']) => {
    if (data == null) {
      return
    }

    unwrapPendingData(data, (chunk, encoding) => {
      this.socket.emit('internal:write', chunk, encoding)
    })
  }

  #onRealSocketConnect = () => {
    if (!this.#passthroughSocket) {
      return
    }

    this.socket._handle = this.#passthroughSocket._handle

    Reflect.set(this.socket, 'connecting', false)
    this.socket.emit('connect')
    this.socket.emit('ready')
  }

  #onRealSocketData = (data: Buffer) => {
    if (this.socket.isPaused()) {
      this.#passthroughPausedBuffer.push(data)
      return
    }

    if (!this.socket.push(data)) {
      this.#passthroughSocket?.pause()
    }
  }

  #onRealSocketError = (error: Error) => {
    this.socket.destroy(error)
  }

  #onRealSocketEnd = () => {
    this.socket.push(null)
  }

  #onMockSocketDrain = () => {
    this.#passthroughSocket?.resume()
  }

  public claim(): void {
    super.claim()

    if (this.socket.connecting) {
      this.pendingConnection.then(([request, handle]) => {
        /**
         * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
         */
        request.oncomplete(0, handle, request, true, true)
      })
    }
  }

  public errorWith(reason?: Error): void {
    this.socket.destroy(reason)
  }

  public passthrough(
    flushPendingData?: (
      data: NonNullable<net.Socket['_pendingData']>,
      encoding: BufferEncoding | undefined,
      callback: (data: NonNullable<net.Socket['_pendingData']>) => void
    ) => void
  ): net.Socket {
    super.passthrough()

    /**
     * @note Modify the pending data to be flushed to the passthrough socket.
     * In HTTP, this allows sending different request headers (e.g. modified in the listener).
     */
    if (typeof flushPendingData === 'function') {
      // Intentionally grab the latest write method to preserve whatever patches it has.
      const realSocketWriteGeneric = this.socket._writeGeneric

      this.socket._writeGeneric = (writev, data, encoding, callback) => {
        /**
         * @note The scheduled write on "connect" will set "_pendingData" to null.
         * @see https://github.com/nodejs/node/blob/6b5178f77b5d1f5d2adef8a1a092febe171cab80/lib/net.js#L1011
         */
        if (this.socket._pendingData) {
          flushPendingData(data, encoding, (nextData) => {
            realSocketWriteGeneric(writev, nextData, encoding, callback)
          })
          return
        }

        realSocketWriteGeneric(writev, data, encoding, callback)
      }
    }

    // If keepalive, reuse the existing real socket.
    const realSocket =
      this.#passthroughSocket && !this.#passthroughSocket.destroyed
        ? this.#passthroughSocket
        : this.createConnection()

    if (realSocket !== this.#passthroughSocket) {
      this.#passthroughSocket = realSocket
    }

    // Buffer to hold data chunks while the mock socket is paused.
    // This allows async response event listeners to complete before
    // data flows to the mock socket and triggers ClientRequest events.
    this.#passthroughPausedBuffer = []
    this.socket.resume = new Proxy(this.socket.resume, {
      apply: (target, thisArg, argArray) => {
        const result = Reflect.apply(target, thisArg, argArray)

        while (this.#passthroughPausedBuffer.length > 0) {
          const bufferedData = this.#passthroughPausedBuffer.shift()!

          if (!this.socket.push(bufferedData)) {
            this.#passthroughSocket?.pause()
            break
          }
        }

        return result
      },
    })

    this.socket.removeListener('drain', this.#onMockSocketDrain)
    this.socket.on('drain', this.#onMockSocketDrain)

    realSocket
      .removeListener('connect', this.#onRealSocketConnect)
      .removeListener('data', this.#onRealSocketData)
      .removeListener('error', this.#onRealSocketError)
      .removeListener('end', this.#onRealSocketEnd)

    realSocket
      .once('connect', this.#onRealSocketConnect)
      .on('data', this.#onRealSocketData)
      .on('error', this.#onRealSocketError)
      .on('end', this.#onRealSocketEnd)

    return realSocket
  }
}

export class TlsSocketController extends TcpSocketController {
  constructor(
    protected readonly socket: tls.TLSSocket,
    protected readonly createConnection: () => tls.TLSSocket
  ) {
    super(socket, createConnection)
  }

  public claim(): void {
    // Add this callback before "super.claim()" so it executes first.
    // TLSWrap methods have to be patched before TCPWrap fires "oncomplete".
    const handle = this.socket._handle

    handle.start = () => void 0

    /**
     * Mock this to prevent the "Error: Worker exited unexpectedly" error.
     * This will trigger when "secure" is emitted.
     * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L1648
     */
    handle.verifyError = () => void 0

    this.socket.once('connect', () => {
      handle.onhandshakedone()
      handle.onnewsession(1, Buffer.alloc(0))
    })

    super.claim()
  }

  public passthrough(): tls.TLSSocket {
    const realSocket = super.passthrough() as tls.TLSSocket

    /**
     * @note Remove the internal "connect" listener added when the mock socket was created.
     * If preserved, that connect will prevent the mock socket from transitioning into the
     * connected state.
     *
     * This prevents the following error:
     *  #  node (vitest 4)[8686]: static void node::crypto::TLSWrap::Start(const FunctionCallbackInfo<Value> &) at ../src/crypto/crypto_tls.cc:589
     #  Assertion failed: !wrap->started_
     */
    this.socket.removeListener('connect', this.socket._start)

    realSocket
      .on('secure', () => {
        this.socket.emit('secure')
      })
      .on('session', (...args) => {
        this.socket.emit('session', ...args)
      })

    return realSocket
  }
}
