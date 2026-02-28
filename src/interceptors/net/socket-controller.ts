import net from 'node:net'
import tls from 'node:tls'
import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { toBuffer } from '../../utils/bufferUtils'
import { createLogger } from '../../utils/logger'
import { unwrapPendingData } from './utils/flush-writes'
import { NetworkConnectionOptions } from './utils/normalize-net-connect-args'
import { getAddressInfoByConnectionOptions } from './utils/address-info'

const kListenerWrap = Symbol('kListenerWrap')

export const kRawSocket = Symbol('kRawSocket')

export const kMockState = Symbol('kMockState')
export const kTlsSocket = Symbol('kTlsSocket')

const log = createLogger('SocketController')

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
      getSession: () => Buffer
      getServername: () => string
      getCipher: () => { name: string; standardName: string; version: string }
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
        return ((chunk, encoding, callback) => {
          const translateWrite = () => {
            socket.push(toBuffer(chunk, encoding), encoding)
            callback?.()
          }

          if (socket.connecting) {
            socket.once('ready', () => translateWrite())
          } else {
            translateWrite()
          }
        }) as net.Socket['write']
      }

      // Translate server-side "socket.end()" to client-sode "socket.push(null)".
      if (property === 'end') {
        const realEnd = getRealValue() as net.Socket['end']

        return ((...args: Parameters<net.Socket['end']>) => {
          const callback = args[args.length - 1]

          const translateEnd = () => {
            socket.push(null)

            if (typeof callback === 'function') {
              callback()
            }
          }

          if (socket.connecting) {
            socket.once('ready', () => translateEnd())
          } else {
            translateEnd()
          }

          return realEnd.apply(target, args)
        }) as net.Socket['end']
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

  /**
   * Claim this socket. Once claimed, the connection attempt succeeds
   * regardless of the requested host and the interceptor becomes the
   * mocked server for this connection.
   */
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

  #connectionOptions?: NetworkConnectionOptions
  #realWriteGeneric: net.Socket['_writeGeneric']
  #passthroughSocket: net.Socket | null = null
  #passthroughPausedBuffer: Array<Buffer> = []

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket
  ) {
    super(socket)

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => {}

    // Store the unpatched write method once so we have access to it between socket state resets.
    this.#realWriteGeneric = this.socket._writeGeneric

    this.socket.connect = new Proxy(this.socket.connect, {
      apply: (target, thisArg, args) => {
        log('socket.connect()', args)

        this.#connectionOptions = args[0]
        return Reflect.apply(target, thisArg, args)
      },
    })

    /**
     * @note A single socket can be reused for connections to the same host.
     * When one connection ends, the Agent frees the socket, then uses it
     * to write the next request's HTTP message immediately. Use the "free"
     * event to transition the controller into the pending state so "_writeGeneric"
     * would behave correctly.
     */
    socket
      .on('free', () => {
        log('socket has been freed!')
        this.#reset()
      })
      .on('close', () => {
        this.#passthroughSocket = null
        this.#passthroughPausedBuffer = []
      })

    this.serverSocket = toServerSocket(this.socket)

    this.pendingConnection = new DeferredPromise()
    this.#reset()
  }

  #reset(): void {
    log('resetting the socket...')

    this.readyState = SocketController.PENDING
    this.pendingConnection = new DeferredPromise()

    const wrapHandle = (handle: TcpHandle) => {
      this.pendingConnection.then(() => {
        log('connection request resolved!', this.readyState)

        process.nextTick(() => {
          /**
           * @note If by this point the socket hasn't been handled,
           * is still connecting, doesn't have any writes buffered,
           * and has a "connect" listener, assume it's the "write after connect"
           * scenario (e.g. undici). In that case, auto-claim the socket to
           * transition to the connected state appropriately to its handle.
           */
          if (
            this.readyState === SocketController.PENDING &&
            this.socket.connecting &&
            this.socket._pendingData == null &&
            this.socket.listenerCount('connect') > 0
          ) {
            log('assume connect->write socket, calling "connect" listeners...')
            this.onPreemptiveConnect()
          }
        })
      })

      handle.connect = handle.connect6 = (request) => {
        log('handle.connect()')
        this.pendingConnection.resolve([request, handle])
      }

      log('socket handle wrapped! waiting for connection request...')
    }

    if (this.socket._handle) {
      wrapHandle(this.socket._handle)
    } else {
      this.socket.prependOnceListener('connectionAttempt', () => {
        wrapHandle(this.socket._handle)
      })
    }

    this.socket._writeGeneric = (...args) => {
      log('socket write:', args, this.readyState)

      if (this.readyState === SocketController.PENDING) {
        // Socket might write immediately, before the "connection" interceptor event is emitted.
        // In those cases, schedule the emit on the next tick to ensure the server socket emits "data".
        if (this.socket.listenerCount('internal:write') === 0) {
          process.nextTick(() => this.#push(args[1]))
        } else {
          this.#push(args[1])
        }

        /**
         * @note Execute the write callbacks while the socket is still pending.
         * This prevents the socket from getting stuck when calling ".end()" in a write callback.
         */
        if (typeof args[3] === 'function') {
          args[3]()

          /**
           * @note Replace the original write callback with an empty function.
           * This prevents the "TypeError: cb is not a function" error on "Socket.onClose".
           */
          args[3] = () => {}
        }

        return this.#realWriteGeneric.apply(this.socket, args)
      }

      /**
       * Handle "_writeGeneric" calls scheduled after the "connect" event.
       * These are writes performed while connecting, and for the mocked socket
       * they must be ignored. There's nowhere to flush them. Calling "_writeGeneric"
       * past this point will result in "Error: write EBADF".
       * @see https://github.com/nodejs/node/blob/main/deps/uv/src/unix/stream.c#L1304-L1305
       */
      if (this.readyState === SocketController.MOCKED) {
        const callback = args[3]

        // Mock connection still means the socket emits the "connect" event
        // and tries to flush any buffered writes to the server. Since there's
        // nowhere to flush them, skip writing and only invoke the callback
        // that will reset pending data/encoding.
        if (this.socket._pendingData) {
          // this.socket._pendingData = null
          // this.socket._pendingEncoding = ''
          callback?.()
          return
        }

        this.#push(args[1])
        callback?.()
        return
      }

      log('writing to passthrough:', args)
      return this.#realWriteGeneric.apply(this.socket, args)
    }
  }

  protected onPreemptiveConnect() {
    for (const listener of this.socket.listeners('connect')) {
      listener.apply(this.socket)
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
    if (this.socket.destroyed) {
      log('real socket errored but mock socket already destroyed, skipping...')
      return
    }

    log('real socket errored, forwarding...', error)

    this.socket.destroy(error)

    // The handle swap in passthrough (this.socket._handle = realSocket._handle)
    // breaks Node's internal close machinery—destroy() emits "error" but never
    // emits "close". Consumers like Undici wait for "close" to finalize the
    // request, so we must emit it manually.
    process.nextTick(() => this.socket.emit('close', true))
  }

  #onRealSocketEnd = () => {
    this.socket.push(null)
  }

  #onRealSocketClose = (hadError: boolean) => {
    this.socket.emit('close', hadError)
  }

  #onMockSocketDrain = () => {
    this.#passthroughSocket?.resume()
  }

  public claim(): void {
    super.claim()

    if (!this.socket.connecting) {
      log('socket already connected, skipping claim...')
      return
    }

    log('claim!')

    /**
     * Patch the "getsockname" on the handle in case Node.js decides to handle its errors.
     * Run this if the socket is connecting because "_handle" can be null if socket timed out.
     * @see https://github.com/nodejs/node/blob/13eb80f3b718452213e0fc449702aefbbfe4110f/lib/net.js#L971
     */
    this.socket._handle.getsockname = () => 0
    this.socket.address = () => {
      return getAddressInfoByConnectionOptions(this.#connectionOptions)
    }

    this.pendingConnection.then(([request, handle]) => {
      log('connection request resolved, mocking the connection...')

      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, handle, request, true, true)
    })
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

    log('passthrough!')

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

    const createNewSocket = () => {
      const realSocket = this.createConnection()

      if (this.socket.timeout != null) {
        realSocket.setTimeout(this.socket.timeout)
      }

      return realSocket
    }

    // If keepalive, reuse the existing real socket.
    const realSocket =
      this.#passthroughSocket && !this.#passthroughSocket.destroyed
        ? this.#passthroughSocket
        : createNewSocket()

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

    this.socket.address = realSocket.address.bind(realSocket)

    this.socket.removeListener('drain', this.#onMockSocketDrain)
    this.socket.on('drain', this.#onMockSocketDrain)

    realSocket
      .removeListener('connect', this.#onRealSocketConnect)
      .removeListener('data', this.#onRealSocketData)
      .removeListener('error', this.#onRealSocketError)
      .removeListener('end', this.#onRealSocketEnd)
      .removeListener('close', this.#onRealSocketClose)

    realSocket
      .once('connect', this.#onRealSocketConnect)
      .on('data', this.#onRealSocketData)
      .on('error', this.#onRealSocketError)
      .on('end', this.#onRealSocketEnd)
      .on('close', this.#onRealSocketClose)

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

  protected onPreemptiveConnect(): void {
    super.onPreemptiveConnect()

    // For TLS sockets, also invoke the "secureConnect" callbacks since some consumers,
    // like Undici, listen to those to start writing to the socket.
    for (const listener of this.socket.listeners('secureConnect')) {
      listener.apply(this.socket)
    }
  }

  public claim(): void {
    // Run this logic before the parent's class method so it executes first.
    // TLSWrap methods have to be patched before TCPWrap fires "oncomplete".
    const handle = this.socket._handle

    handle.start = () => void 0

    /**
     * Mock this to prevent the "Error: Worker exited unexpectedly" error.
     * This will trigger when "secure" is emitted.
     * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L1648
     */
    handle.verifyError = () => void 0

    handle.getSession = () => {
      return Buffer.from('mocked session')
    }

    handle.getCipher = () => {
      return {
        name: 'TLS_AES_256_GCM_SHA384',
        standardName: 'TLS_AES_256_GCM_SHA384',
        version: 'TLSv1.3',
      }
    }

    this.socket.once('connect', () => {
      handle.onhandshakedone()
      handle.onnewsession(1, Buffer.alloc(0))
    })

    super.claim()
  }

  public passthrough(): tls.TLSSocket {
    const realSocket = super.passthrough() as tls.TLSSocket

    /**
     * @note Remove the internal "connect" listener added by the TLS socket.
     * Normally, that listener manages the SSL handshake. But since we're in passthrough,
     * we delegate that to the real socket. Leaving the listener on the mock socket while
     * inheriting the real socket's handle will result in the handshake performed twice, which is a no-op.
     * @see https://github.com/nodejs/node/blob/abddfc921bf2af02a04a6a5d2bca8e2d91d80958/lib/internal/tls/wrap.js#L1105
     *
     * This prevents the following error:
     *  #  node (vitest 4)[8686]: static void node::crypto::TLSWrap::Start(const FunctionCallbackInfo<Value> &) at ../src/crypto/crypto_tls.cc:589
     #  Assertion failed: !wrap->started_
     */
    for (const connectListener of this.socket.listeners('connect')) {
      if (
        connectListener === this.socket._start ||
        ('listener' in connectListener &&
          connectListener.listener === this.socket._start)
      ) {
        this.socket.removeListener('connect', connectListener as () => void)
      }
    }

    realSocket
      .on('secure', () => {
        this.socket.emit('secure')
      })
      .on('session', (...args) => {
        this.socket.emit('session', ...args)
      })
      .on('keylog', (...args) => {
        this.socket.emit('keylog', ...args)
      })
      .on('OCSPResponse', (...args) => {
        this.socket.emit('OCSPResponse', ...args)
      })

    return realSocket
  }
}
