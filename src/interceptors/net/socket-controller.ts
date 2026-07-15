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
export const kPatched = Symbol('kPatched')

const logger = createLogger('socket')

// Internally, Node.js represents the result of various operations
// by the number they return: 0 (error), 1 (success).
type OperationStatus = 0 | 1

declare module 'node:net' {
  interface Socket {
    [kPatched]?: boolean
    _httpMessage?: object | null
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
    _bytesDispatched: number
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
  hasRef?: () => boolean
  fchmod: (mode: number) => void
  setBlocking: (blocking: boolean) => OperationStatus
  setNoDelay?: (noDelay: boolean) => void
  setKeepAlive?: (keepAlive: boolean, initialDelay: number) => void
  setTypeOfService?: (tos: number) => OperationStatus
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
  static CLAIMED = 1 as const
  static PASSTHROUGH = 2 as const

  protected readyState:
    | typeof SocketController.PENDING
    | typeof SocketController.CLAIMED
    | typeof SocketController.PASSTHROUGH

  private [kRawSocket]: net.Socket

  constructor(socket: net.Socket) {
    this[kRawSocket] = socket
    // Mark this socket as patched so socket-related patches
    // (e.g. the "destroyed" getter) can tell it apart from
    // the sockets created before the interception was applied.
    socket[kPatched] = true
    this.readyState = SocketController.PENDING
  }

  /**
   * Claim this socket. Once claimed, the connection attempt succeeds
   * regardless of the requested host and the interceptor becomes the
   * mocked server for this connection.
   */
  public claim(): void {
    invariant(
      this.readyState === SocketController.PENDING,
      'Failed to claim a socket connection: already handled (%s)',
      this.readyState
    )

    this.readyState = SocketController.CLAIMED
  }

  public passthrough(): void {
    invariant(
      this.readyState === SocketController.PENDING,
      'Failed to passthrough a socket connection: already handled (%s)',
      this.readyState
    )

    this.readyState = SocketController.PASSTHROUGH
  }
}

export type FlushPendingDataFunction = (
  data: NonNullable<net.Socket['_pendingData']>,
  encoding: BufferEncoding | undefined,
  callback: (data: NonNullable<net.Socket['_pendingData']>) => void
) => void

type CorkedReadEvent =
  | { type: 'data'; chunk: Buffer }
  | { type: 'end' }
  | { type: 'close'; hadError: boolean }

export class TcpSocketController extends SocketController {
  public serverSocket: net.Socket

  protected pendingConnection: DeferredPromise<[TcpWrap, TcpHandle]>

  #connectionOptions?: NetworkConnectionOptions
  #realWriteGeneric: net.Socket['_writeGeneric']
  #passthroughSocket: net.Socket | null = null
  #bufferedWrites: Array<Parameters<net.Socket['_writeGeneric']>> = []
  #readsCorked = false
  #corkedReads: Array<CorkedReadEvent> = []
  #realHandleSwapped = false
  #clientCloseEmitted = false

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket
  ) {
    super(socket)

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => {}

    // Store the unpatched write method once so we have access to it between socket state resets.
    this.#realWriteGeneric = this.socket._writeGeneric
    this.#bufferedWrites = []

    this.socket.connect = new Proxy(this.socket.connect, {
      apply: (target, thisArg, args) => {
        logger.verbose('socket.connect() %o', args)

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
        logger.verbose('client socket freed!')
        this.#reset()
      })
      .on('close', () => {
        logger.verbose('client socket closed!')
        this.#clientCloseEmitted = true
        this.#passthroughSocket = null
        this.#bufferedWrites = []
        this.#readsCorked = false
        this.#corkedReads = []
      })

    this.serverSocket = toServerSocket(this.socket)

    this.pendingConnection = new DeferredPromise()
    this.#reset()
  }

  /**
   * Reset this controller to the pending state so the next exchange
   * on this socket can be handled anew. This is meant for kept-alive
   * sockets that are reused for multiple exchanges by clients that
   * don't emit the "free" event on the socket (e.g. Undici).
   */
  public reset(): void {
    this.#reset()
  }

  #reset(): void {
    logger.verbose('resetting the socket...')

    this.readyState = SocketController.PENDING
    this.pendingConnection = new DeferredPromise()
    this.#bufferedWrites = []

    const wrapHandle = (handle: TcpHandle) => {
      this.pendingConnection.then(() => {
        logger.verbose('connection request resolved!', this.readyState)

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
            this.#bufferedWrites.length === 0 &&
            this.socket.listenerCount('connect') > 0
          ) {
            logger.verbose(
              'assume connect->write socket, calling "connect" listeners...'
            )
            this.emulateConnect()
          }
        })
      })

      /**
       * Remove the "setTypeOfService" from the handle, if present (Node.js v24+).
       * Removing it has no effect on the socket but prevents the "setTypeOfService EBADF" error.
       * @see https://github.com/nodejs/node/blob/69a970f76814d40f55cf162d0cc3632fe8a7e599/lib/net.js#L661
       * @see https://github.com/nodejs/undici/blob/bf684f7de01616708a33a5d1c092177622394442/lib/dispatcher/client-h1.js#L1136
       */
      if (handle.setTypeOfService) {
        handle.setTypeOfService = undefined
      }

      handle.connect = handle.connect6 = (request) => {
        logger.verbose('handle.connect()')
        this.pendingConnection.resolve([request, handle])
      }

      logger.verbose('socket handle wrapped! waiting for connection request...')
    }

    if (this.socket._handle) {
      wrapHandle(this.socket._handle)
    } else {
      this.socket.prependOnceListener('connectionAttempt', () => {
        wrapHandle(this.socket._handle)
      })
    }

    this.socket._writeGeneric = (...args) => {
      const data = args[1]
      const callback = args[3]

      logger.verbose('socket write (state: %d) %o', this.readyState, args)

      /**
       * @note Buffer the write BEFORE pushing data to the server socket.
       * `#push` triggers the 'data' event on the server socket synchronously,
       * which may lead to `passthrough()` being called within the same call stack.
       * If we buffer after `#push`, passthrough will read an empty `#bufferedWrites`
       * and the request data will never be flushed to the real socket.
       */
      this.#bufferedWrites.push(args)

      /**
       * @note Reflect the buffered write in "_pendingData" so it counts
       * toward "bytesWritten", the same way Node.js counts the pending
       * data of a connecting socket. Flushing the buffered writes resets
       * "_pendingData" (see `passthrough()`).
       */
      const pendingData = Array.isArray(this.socket._pendingData)
        ? this.socket._pendingData
        : []

      unwrapPendingData(data, (chunk, chunkEncoding) => {
        pendingData.push({ chunk, encoding: chunkEncoding })
      })

      this.socket._pendingData = pendingData

      // The server socket will NEVER have any "data" listeners attached
      // becuase the "connection" interceptor event emits on the next tick.
      if (this.socket.listenerCount('internal:write') === 0) {
        logger.verbose(
          'no server data listeners, scheduling to the next tick...'
        )

        process.nextTick(() => {
          logger.verbose(
            'forwarding scheduled write to server socket (state: %d) %o',
            this.readyState,
            data
          )
          this.#push(data)
        })
      } else {
        logger.verbose(
          'pushing to server data listeners (state: %d)',
          this.readyState
        )
        this.#push(data)
      }

      /**
       * @note Only skip the callback if the socket transitioned to PASSTHROUGH.
       * In the passthrough case, `#push` triggered `passthrough()` synchronously
       * and the buffered write was already flushed to the real socket with the
       * original callback. Calling it again would result in "Callback called
       * multiple times" error.
       *
       * For CLAIMED state, `#push` may have triggered `claim()` synchronously
       * (e.g. the handler responded with a mocked response). In that case,
       * the callback was NOT flushed anywhere and must still be called here
       * so the socket's writable state completes properly (enabling "finish").
       */
      if (
        typeof callback === 'function' &&
        this.readyState !== SocketController.PASSTHROUGH
      ) {
        callback()
        args[3] = function mockNoop() {}
      }
    }
  }

  protected emulateConnect() {
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

    logger.verbose('server push %o', data)

    unwrapPendingData(data, (chunk, encoding) => {
      logger.verbose('server emitting "data" %o', { chunk, encoding })

      this.socket.emit('internal:write', chunk, encoding)
    })
  }

  #onRealSocketConnect = () => {
    if (!this.#passthroughSocket) {
      return
    }

    this.socket._handle = this.#passthroughSocket._handle
    this.#realHandleSwapped = true

    Reflect.set(this.socket, 'connecting', false)
    this.socket.emit('connect')
    this.socket.emit('ready')
  }

  #onRealSocketConnectionAttemptFailed = (
    address: string,
    port: number,
    family: number,
    error: Error
  ) => {
    this.socket.emit('connectionAttemptFailed', address, port, family, error)
  }

  #onRealSocketConnectionAttemptTimeout = (
    address: string,
    port: number,
    family: number
  ) => {
    this.socket.emit('connectionAttemptTimeout', address, port, family)
  }

  #onRealSocketData = (data: Buffer) => {
    logger.verbose('real socket "data" event %o', data)

    if (this.#readsCorked) {
      logger.verbose('reads are corked, buffering the data...')
      this.#corkedReads.push({ type: 'data', chunk: data })
      return
    }

    if (!this.socket.push(data)) {
      logger.verbose(
        'client socket forbade more pushes, pausing the passthrough socket...'
      )
      this.#passthroughSocket?.pause()
    }
  }

  #onRealSocketError = (error: Error) => {
    logger.verbose('real socket "error" event %o', error)

    if (this.socket.destroyed) {
      logger.verbose(
        'real socket errored but client socket already destroyed, skipping...'
      )
      return
    }

    logger.verbose('real socket errored, forwarding %o', error)

    this.socket.destroy(error)

    // The handle swap in passthrough (this.socket._handle = realSocket._handle)
    // breaks Node's internal close machinery—destroy() emits "error" but never
    // emits "close". Consumers like Undici wait for "close" to finalize the
    // request, so we must emit it manually.
    // Before the swap (e.g. a failed connection attempt), the client socket
    // emits "close" on its own, and emitting here would duplicate it.
    if (this.#realHandleSwapped) {
      process.nextTick(() => this.socket.emit('close', true))
    }
  }

  #onRealSocketEnd = () => {
    if (this.#readsCorked) {
      this.#corkedReads.push({ type: 'end' })
      return
    }

    this.socket.push(null)
  }

  #onRealSocketClose = (hadError: boolean) => {
    if (this.#readsCorked) {
      this.#corkedReads.push({ type: 'close', hadError })
      return
    }

    // The client socket already emitted "close" (e.g. it was destroyed
    // with an error before the handle swap). Forwarding the real socket
    // "close" would emit it twice.
    if (this.#clientCloseEmitted) {
      return
    }

    // A destroyed client socket with an intact handle emits "close"
    // through its own machinery. Only forward the real socket "close"
    // when the handle swap suppressed that emission.
    if (this.socket.destroyed && !this.#realHandleSwapped) {
      return
    }

    this.socket.emit('close', hadError)
  }

  #onMockSocketDrain = () => {
    logger.verbose('client socket drained!')
    this.#passthroughSocket?.resume()
  }

  /**
   * Suspend forwarding of the passthrough socket events ("data", "end", "close")
   * to the client socket. The events are buffered in order until `uncorkReads()`
   * is called. This allows the consumer to delay the delivery of the original
   * response to the client (e.g. until its own asynchronous logic settles).
   *
   * @note Pausing the client socket is not enough to delay the delivery.
   * Consumers like Undici read the pushed data from a paused socket
   * directly via `socket.read()`, which is unaffected by `socket.pause()`.
   */
  public corkReads(): void {
    this.#readsCorked = true
  }

  /**
   * Resume forwarding of the passthrough socket events to the client socket,
   * replaying any events buffered while the reads were corked.
   */
  public uncorkReads(): void {
    if (!this.#readsCorked) {
      return
    }

    this.#readsCorked = false

    for (const corkedRead of this.#corkedReads.splice(0)) {
      switch (corkedRead.type) {
        case 'data': {
          if (!this.socket.push(corkedRead.chunk)) {
            logger.verbose(
              'client socket forbade more pushes, pausing the passthrough socket...'
            )
            this.#passthroughSocket?.pause()
          }
          break
        }

        case 'end': {
          this.socket.push(null)
          break
        }

        case 'close': {
          this.socket.emit('close', corkedRead.hadError)
          break
        }
      }
    }
  }

  public claim(): void {
    super.claim()

    if (!this.socket.connecting) {
      logger.verbose('socket already connected, skipping claim...')
      return
    }

    logger.verbose('-> claim!')

    /**
     * Patch the "getsockname" on the handle in case Node.js decides to handle its errors.
     * Run this if the socket is connecting because "_handle" can be null if socket timed out.
     * @see https://github.com/nodejs/node/blob/13eb80f3b718452213e0fc449702aefbbfe4110f/lib/net.js#L971
     */
    this.socket._handle.getsockname = () => 0
    this.socket.address = () => {
      return getAddressInfoByConnectionOptions(this.#connectionOptions)
    }

    this.#bufferedWrites = []

    /**
     * @note Once claimed, there's nowhere to write chunks to.
     * Just forward the writes to the server socket and invoke callbacks.
     * Attempting to write past this point will result in the "Error: write EBADF".
     */
    this.socket._writeGeneric = (...args) => {
      logger.verbose('socket write (state: %d) %o', this.readyState, args)

      const data = args[1]
      const callback = args[3]

      this.#push(data)

      if (typeof callback === 'function') {
        logger.verbose(
          'invoking write callback (state: %d) %o',
          this.readyState,
          { data, callback }
        )
        callback()
      }
    }

    this.pendingConnection.then(([request, handle]) => {
      logger.verbose('connection request resolved, mocking the connection...')

      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, handle, request, true, true)
    })
  }

  public passthrough(flushPendingData?: FlushPendingDataFunction): net.Socket {
    super.passthrough()

    logger.verbose('-> passthrough!')

    const createRealSocket = () => {
      const realSocket = this.createConnection()

      // Mark the passthrough socket as patched so it's exempt from
      // the unpatched socket detection (it never enters agent pools,
      // but this skips the detection cost on its every "destroyed" read).
      realSocket[kPatched] = true

      if (this.socket.timeout != null) {
        realSocket.setTimeout(this.socket.timeout)
      }

      return realSocket
    }

    // If keepalive, reuse the existing real socket.
    const realSocket =
      this.#passthroughSocket && !this.#passthroughSocket.destroyed
        ? this.#passthroughSocket
        : createRealSocket()

    if (realSocket !== this.#passthroughSocket) {
      this.#passthroughSocket = realSocket
    }

    if (this.#bufferedWrites.length === 0) {
      logger.verbose(
        'passthrough with empty writes buffer (state: %d)',
        this.readyState
      )
    }

    /**
     * Flush any writes during the pending phase to the passthrough socket.
     * @note These are written directly on the passthrough socket to prevent
     * them from being forwarded as "data" events on the server (already emitted).
     */
    for (let i = 0; i < this.#bufferedWrites.length; i++) {
      const pendingWrite = this.#bufferedWrites[i]

      if (i === 0 && typeof flushPendingData === 'function') {
        const data = pendingWrite[1]
        const encoding = pendingWrite[2]
        flushPendingData(data, encoding, (nextData) => {
          pendingWrite[1] = nextData
        })
      }

      realSocket._writeGeneric.apply(realSocket, pendingWrite)
    }

    this.#bufferedWrites = []
    this.socket._pendingData = null
    this.socket._pendingEncoding = ''

    this.socket._writeGeneric = (...args) => {
      logger.verbose('socket write (state: %d) %o', this.readyState, args)

      this.#push(args[1])

      /**
       * @note The controller may be reset synchronously while the pushed
       * data is being parsed (e.g. a new request written to a kept-alive,
       * passed-through socket). In that case, buffer this write instead of
       * forwarding it so it's flushed once the new exchange is handled.
       */
      if (this.readyState !== SocketController.PASSTHROUGH) {
        this.#bufferedWrites.push(args)

        const callback = args[3]

        if (typeof callback === 'function') {
          callback()
          args[3] = function mockNoop() {}
        }

        return
      }

      /**
       * @note While the client socket is still connecting, its original
       * write implementation buffers the written data and REPLAYS it
       * through this override once the socket emits the "connect" event
       * (see `Socket.prototype._writeGeneric` in Node.js). That replay
       * would push the same data to the server socket twice. Write
       * directly to the passthrough socket instead, the same way the
       * buffered writes are flushed in `passthrough()`.
       */
      if (this.socket.connecting && this.#passthroughSocket) {
        return this.#passthroughSocket._writeGeneric.apply(
          this.#passthroughSocket,
          args
        )
      }

      return this.#realWriteGeneric.apply(this.socket, args)
    }

    this.socket.address = realSocket.address.bind(realSocket)

    this.socket.removeListener('drain', this.#onMockSocketDrain)
    this.socket.on('drain', this.#onMockSocketDrain)

    realSocket
      .removeListener('connect', this.#onRealSocketConnect)
      .removeListener(
        'connectionAttemptFailed',
        this.#onRealSocketConnectionAttemptFailed
      )
      .removeListener(
        'connectionAttemptTimeout',
        this.#onRealSocketConnectionAttemptTimeout
      )
      .removeListener('data', this.#onRealSocketData)
      .removeListener('error', this.#onRealSocketError)
      .removeListener('end', this.#onRealSocketEnd)
      .removeListener('close', this.#onRealSocketClose)

    realSocket
      .once('connect', this.#onRealSocketConnect)
      .on(
        'connectionAttemptFailed',
        this.#onRealSocketConnectionAttemptFailed
      )
      .on(
        'connectionAttemptTimeout',
        this.#onRealSocketConnectionAttemptTimeout
      )
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

  protected emulateConnect(): void {
    super.emulateConnect()

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

  public passthrough(
    flushPendingData?: FlushPendingDataFunction
  ): tls.TLSSocket {
    const realSocket = super.passthrough(flushPendingData) as tls.TLSSocket

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
