import net from 'node:net'
import tls from 'node:tls'
import { invariant } from 'outvariant'
import { toBuffer } from '../../utils/buffer-utils'
import { createLogger } from '../../utils/logger'
import { unwrapPendingData, writePendingData } from './utils/flush-writes'
import { NetworkConnectionOptions } from './utils/normalize-net-connect-args'
import { TlsConnectionOptions } from './utils/normalize-tls-connect-args'
import { getTlsConnectOptions } from './utils/get-tls-connect-options'
import {
  getAddressInfoByConnectionOptions,
  getLocalAddressInfoByConnectionOptions,
} from './utils/address-info'

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
    _unrefTimer: () => void
  }
}

declare module 'node:tls' {
  interface TLSSocket {
    _handle: TcpHandle & {
      start: () => void
      onhandshakedone: () => void
      onnewsession: (sessionId: unknown, session: Buffer) => void
      getSession: () => Buffer
      isSessionReused: () => boolean
      getServername: () => string
      getALPNNegotiatedProtocol: () => string | false
      getCipher: () => { name: string; standardName: string; version: string }
      getEphemeralKeyInfo: () => tls.EphemeralKeyInfo
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
  getpeername?: (
    addressInfo: ReturnType<net.Socket['address']>
  ) => OperationStatus
  getsockname?: (
    addressInfo: ReturnType<net.Socket['address']>
  ) => OperationStatus
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
interface PendingServerWrite {
  chunk: string | Uint8Array
  encoding?: BufferEncoding
  callback?: (error?: Error) => void
}

interface PendingServerEnd {
  chunk?: string | Uint8Array
  encoding?: BufferEncoding
  callback?: () => void
}

function toServerSocket<T extends net.Socket>(socket: T): T {
  /**
   * The server-side write buffer. Pushing data to the client honors
   * the client's read backpressure: once "socket.push()" reports a
   * full buffer, subsequent server writes queue here and flush when
   * the client reads again ("_read"). This mirrors how a real server
   * cannot write faster than the client consumes.
   */
  const pendingWrites: Array<PendingServerWrite> = []
  let pendingEnd: PendingServerEnd | undefined
  let isBackpressured = false
  let isFlushScheduled = false

  const flushPendingWrites = (): boolean => {
    /**
     * @note The mocked connection is not established yet. Flush once
     * it is, the same way a real server cannot write to a client
     * that has not connected.
     */
    if (socket.connecting) {
      isBackpressured = true

      if (!isFlushScheduled) {
        isFlushScheduled = true
        socket.once('ready', () => {
          isFlushScheduled = false
          flushPendingWrites()
        })
      }

      return false
    }

    while (pendingWrites.length > 0) {
      const nextWrite = pendingWrites.shift()!

      // Receiving mocked data is socket activity: refresh the client's
      // idle timer the same way its own reads would.
      socket._unrefTimer()

      const canPushMore = socket.push(
        toBuffer(nextWrite.chunk, nextWrite.encoding),
        nextWrite.encoding
      )
      nextWrite.callback?.()

      if (!canPushMore) {
        isBackpressured = true
        return false
      }
    }

    const wasBackpressured = isBackpressured
    isBackpressured = false

    if (pendingEnd) {
      const finalEnd = pendingEnd
      pendingEnd = undefined

      // Deliver the final chunk passed to "end(chunk)", if any.
      if (finalEnd.chunk != null) {
        socket.push(toBuffer(finalEnd.chunk, finalEnd.encoding), finalEnd.encoding)
      }

      socket.push(null)
      finalEnd.callback?.()
    }

    if (wasBackpressured) {
      socket.emit('internal:drain')
    }

    return true
  }

  /**
   * @note "_read" is the client asking for more data. Flush the
   * buffered server writes so the delivery resumes as the client
   * reads, completing the backpressure loop.
   */
  const realRead = socket._read.bind(socket)
  socket._read = (size: number) => {
    realRead(size)

    if (pendingWrites.length > 0 || pendingEnd != null || isBackpressured) {
      flushPendingWrites()
    }
  }

  return new Proxy(socket, {
    get: (target, property, receiver) => {
      const getRealValue = () => {
        return Reflect.get(target, property, receiver)
      }

      if (
        property === 'on' ||
        property === 'addListener' ||
        property === 'once' ||
        property === 'prependListener' ||
        property === 'prependOnceListener'
      ) {
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

            /**
             * @note Subscribe using the same method (e.g. "once") so its
             * listener semantics apply to the internal channel too.
             */
            Reflect.apply(realAddListener, target, [
              'internal:write',
              listenerWrap,
            ])

            return target
          }

          /**
           * @note The "drain" event on the server socket signals the
           * flush of the server-side write buffer. It is routed through
           * an internal channel so it does not clash with the "drain"
           * event of the underlying client socket.
           */
          if (event === 'drain') {
            Reflect.apply(realAddListener, target, ['internal:drain', listener])
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
              // The wrap is subscribed to the internal channel,
              // not the "data" event (see the listener proxy above).
              return realRemoveListener.call(
                target,
                'internal:write',
                listenerWrap
              )
            }
          }

          if (event === 'drain') {
            return realRemoveListener.call(target, 'internal:drain', listener)
          }

          return realRemoveListener.call(target, event, listener)
        }
      }

      // Push data to the client socket when server "socket.write()" is called.
      if (property === 'write') {
        return ((chunk, encoding, callback) => {
          if (typeof encoding === 'function') {
            callback = encoding
            encoding = undefined
          }

          pendingWrites.push({ chunk, encoding, callback })

          /**
           * @note Do not push more data to a client that is not
           * reading. The write stays buffered until the client reads
           * again, and "drain" signals the flush.
           */
          if (isBackpressured) {
            return false
          }

          return flushPendingWrites()
        }) as net.Socket['write']
      }

      // Translate server-side "socket.end()" to client-sode "socket.push(null)".
      if (property === 'end') {
        return ((...args: Parameters<net.Socket['end']>): net.Socket => {
          const callback = args[args.length - 1]
          const chunk = typeof args[0] === 'function' ? undefined : args[0]
          const encoding = typeof args[1] === 'string' ? args[1] : undefined

          /**
           * @note The end-of-stream is delivered once the buffered
           * writes flush so the client never observes the EOF before
           * the data that preceded it.
           */
          pendingEnd = {
            chunk,
            encoding,
            callback: typeof callback === 'function' ? callback : undefined,
          }
          flushPendingWrites()

          /**
           * @note Do not end the client socket's writable side.
           * The server ending the connection only signals EOF to the
           * client (the client may keep writing on half-open sockets).
           */
          return target
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

  public readyState:
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

  /**
   * Establish this socket connection as-is.
   */
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

  protected pendingConnection: PromiseWithResolvers<[TcpWrap, TcpHandle]>

  #connectionOptions?: NetworkConnectionOptions
  #realWriteGeneric: net.Socket['_writeGeneric']
  #passthroughSocket: net.Socket | null = null
  #bufferedWrites: Array<Parameters<net.Socket['_writeGeneric']>> = []
  #readsCorked = false
  #corkedReads: Array<CorkedReadEvent> = []
  #realHandleSwapped = false
  #clientCloseEmitted = false
  #clientEndPushed = false
  #connectEmulated = false
  #onPassthroughRead?: (chunk: Buffer) => void

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket,
    connectionOptions?: NetworkConnectionOptions
  ) {
    super(socket)

    /**
     * @note Plain TCP sockets capture the connection options from the
     * "socket.connect()" proxy below. TLS sockets carry additional
     * TLS-level options that never pass through "socket.connect()",
     * so those are provided explicitly (see "TlsSocketController").
     */
    this.#connectionOptions = connectionOptions

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => {
      /**
       * @note Resume the passthrough socket when the consumer asks for
       * more data. Node.js calls "_read()" once the consumer drains the
       * read buffer (e.g. after "resume()"). The passthrough socket may
       * have been paused when the consumer's buffer got full, and this
       * is the only signal to continue reading.
       */
      this.#passthroughSocket?.resume()
    }

    // Store the unpatched write method so passthrough writes can
    // delegate to it once the socket receives the real handle.
    this.#realWriteGeneric = this.socket._writeGeneric
    this.#bufferedWrites = []

    this.socket._writeGeneric = (...args) => {
      this.#handleWrite(args)
    }

    this.socket.connect = new Proxy(this.socket.connect, {
      apply: (target, thisArg, args) => {
        logger.verbose('socket.connect() %o', args)

        this.#connectionOptions = args[0]

        /**
         * @note Do not bind the intercepted socket to the requested
         * local address/port. Binding reserves the port for real, and
         * the passthrough connection (created with the original options)
         * would then bind the same port again, resulting in a conflict.
         * The requested values are still reflected in the address info
         * of a claimed socket (see "claim()").
         */
        if (
          args[0] != null &&
          typeof args[0] === 'object' &&
          (args[0].localAddress != null || args[0].localPort != null)
        ) {
          args[0] = { ...args[0], localAddress: undefined, localPort: undefined }
        }

        return Reflect.apply(target, thisArg, args)
      },
    })

    /**
     * @note A single socket can be reused for connections to the same host.
     * When one connection ends, the Agent frees the socket, then uses it
     * to write the next request's HTTP message immediately. Use the "free"
     * event to transition the controller into the pending state so the
     * next exchange is handled anew.
     */
    socket
      .on('free', () => {
        logger.verbose('client socket freed!')
        this.reset()
      })
      .on('close', () => {
        logger.verbose('client socket closed!')
        this.#clientCloseEmitted = true

        /**
         * @note Destroy the passthrough socket, if any. The client
         * socket is done, and a passthrough connection left open would
         * linger until the server closes it (or error unhandled if it
         * is still connecting).
         */
        this.#passthroughSocket?.destroy()
        this.#passthroughSocket = null

        this.#bufferedWrites = []
        this.#readsCorked = false
        this.#corkedReads = []
      })

    this.serverSocket = toServerSocket(this.socket)

    this.pendingConnection = Promise.withResolvers()
    this.#reset()
  }

  /**
   * Reset this controller to the pending state so the next exchange
   * on this socket can be handled anew. This is meant for kept-alive
   * sockets that are reused for multiple exchanges by clients that
   * don't emit the "free" event on the socket (e.g. Undici).
   */
  public reset(): void {
    /**
     * @note Only settled (claimed or passed-through) sockets need a reset.
     * Resetting a pending socket again would discard the writes already
     * buffered for the next exchange (e.g. the Agent "free" event firing
     * after the parser has reset this controller at a message boundary).
     */
    if (this.readyState === SocketController.PENDING) {
      return
    }

    this.#reset()
  }

  #reset(): void {
    logger.verbose('resetting the socket...')

    this.readyState = SocketController.PENDING
    this.pendingConnection = Promise.withResolvers()
    this.#bufferedWrites = []
    this.#connectEmulated = false

    // Release the pending data of the previous exchange, if any,
    // so kept-alive sockets do not retain every written payload.
    this.socket._pendingData = null
    this.socket._pendingEncoding = ''

    const wrapHandle = (handle: TcpHandle) => {
      this.pendingConnection.promise.then(() => {
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
  }

  /**
   * Handle a write performed on the client socket. Installed once as
   * "_writeGeneric", this is the single write path for every controller
   * state, dispatching on "readyState".
   */
  #handleWrite(args: Parameters<net.Socket['_writeGeneric']>): void {
    const data = args[1]

    logger.verbose('socket write (state: %d) %o', this.readyState, args)

    /**
     * @note Buffer the write BEFORE pushing the data to the server socket.
     * Handling the pushed data may transition this controller within the
     * same call stack, and each transition settles the buffered entry:
     * "passthrough()" flushes it to the real socket, "claim()" drops it,
     * and a reset at an HTTP message boundary keeps it for the next exchange.
     */
    this.#bufferedWrites.push(args)

    if (this.readyState === SocketController.PENDING) {
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
      // on the first write because the "connection" interceptor event
      // emits on the next tick.
      if (this.socket.listenerCount('internal:write') === 0) {
        logger.verbose(
          'no server data listeners, scheduling to the next tick...'
        )

        process.nextTick(() => {
          this.#push(data)
        })
      } else {
        this.#push(data)
      }
    } else {
      this.#push(data)
    }

    /**
     * Dispatch on the state observed AFTER the push since handling the
     * pushed data may have transitioned this controller synchronously.
     */
    switch (this.readyState) {
      case SocketController.PENDING: {
        /**
         * @note The write either awaits the verdict on this exchange or,
         * if the push reset this controller at a message boundary, opens
         * the next exchange (the reset cleared the buffer; re-buffer it).
         */
        if (!this.#bufferedWrites.includes(args)) {
          this.#bufferedWrites.push(args)
        }

        this.#acknowledgeWrite(args)
        return
      }

      case SocketController.CLAIMED: {
        /**
         * @note Once claimed, there's nowhere else to write chunks to.
         * The data was delivered to the server socket; complete the write
         * so the socket's writable state settles (enabling "finish").
         */
        this.#removeBufferedWrite(args)
        this.#acknowledgeWrite(args)
        return
      }

      case SocketController.PASSTHROUGH: {
        /**
         * @note A synchronous "passthrough()" has already flushed this
         * write (with its callback) to the real socket.
         */
        if (!this.#removeBufferedWrite(args)) {
          return
        }

        /**
         * @note Until the handle swap, the client socket's own handle
         * cannot carry any data (it never actually connects). Write
         * directly to the passthrough socket instead. This also prevents
         * the "connecting" write replay of `Socket.prototype._writeGeneric`
         * from pushing the same data to the server socket twice.
         */
        if (!this.#realHandleSwapped && this.#passthroughSocket) {
          writePendingData(this.#passthroughSocket, data, args[2], args[3])
          return
        }

        this.#realWriteGeneric.apply(this.socket, args)
      }
    }
  }

  /**
   * Complete the given write by invoking its callback. The callback is
   * then removed from the write entry so flushing that entry later
   * (e.g. on passthrough) does not invoke it twice.
   */
  #acknowledgeWrite(args: Parameters<net.Socket['_writeGeneric']>): void {
    const callback = args[3]

    if (typeof callback === 'function') {
      callback()
      args[3] = undefined
    }
  }

  #removeBufferedWrite(
    args: Parameters<net.Socket['_writeGeneric']>
  ): boolean {
    const index = this.#bufferedWrites.indexOf(args)

    if (index === -1) {
      return false
    }

    this.#bufferedWrites.splice(index, 1)
    return true
  }

  protected emulateConnect() {
    this.#connectEmulated = true

    /**
     * @note Reflect the connected state before notifying the listeners,
     * the same way Node.js does before emitting "connect".
     */
    Reflect.set(this.socket, 'connecting', false)

    /**
     * @note Invoke the raw listeners so the "once" wrappers get
     * consumed. This prevents listeners like the connection callback
     * from being invoked again when "connect" is emitted for real
     * (e.g. once the claimed connection completes).
     */
    for (const listener of this.socket.rawListeners('connect')) {
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

    /**
     * @note The consumer may destroy the socket while the passthrough
     * connection is still being established. The passthrough "connect"
     * (I/O poll phase) can arrive before the client's "close" callback
     * (close phase) within the same event loop iteration. A destroyed
     * socket must not emit "connect"/"ready".
     */
    if (this.socket.destroyed) {
      this.#passthroughSocket.destroy()
      return
    }

    const replacedHandle = this.socket._handle
    const wasUnrefed =
      replacedHandle != null &&
      typeof replacedHandle.hasRef === 'function' &&
      !replacedHandle.hasRef()

    this.socket._handle = this.#passthroughSocket._handle
    this.#realHandleSwapped = true

    /**
     * @note Preserve the ref state across the handle swap. If the
     * consumer unrefed the socket while it was connecting, the swapped
     * handle must not hold the process alive either.
     */
    if (wasUnrefed) {
      this.socket._handle.unref?.()
    }

    /**
     * @note Close the replaced handle. Nothing references it past this
     * point, and left open, it keeps the process alive indefinitely.
     * For TLS sockets, the replaced handle is a TLSWrap; close its
     * underlying transport too (closing the wrap alone does not close
     * the TCP handle it sits on).
     */
    if (replacedHandle != null) {
      replacedHandle.close()
      replacedHandle._parent?.close()
    }

    Reflect.set(this.socket, 'connecting', false)

    /**
     * @note Read the remote address info once so it gets cached on the
     * socket. The passthrough socket controls the swapped handle and may
     * close it at any point (e.g. once the server ends the connection),
     * while Node.js keeps serving the cached info for sockets that
     * have connected. Reading must happen after the socket is no longer
     * connecting (the info of connecting sockets is never cached).
     */
    void this.socket.remoteAddress

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

    /**
     * @note Receiving data is socket activity. Refresh the idle timer
     * of the client socket the same way its own reads would
     * ("socket.setTimeout()" must not fire during an active transfer).
     * The data arrives on the real socket, which only refreshes the
     * real socket's timer.
     */
    this.socket._unrefTimer()

    /**
     * @note Hand the raw server bytes to the passthrough read handler
     * when one is set, delegating the forwarding to the client entirely.
     * A protocol-aware consumer (e.g. the SMTP interceptor) uses this to
     * mediate the reply stream reply-by-reply so a listener can suppress
     * or rewrite a single reply before it reaches the client.
     */
    if (this.#onPassthroughRead) {
      this.#onPassthroughRead(data)
      return
    }

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
    // Receiving the end-of-stream is a read, the same as data.
    this.socket._unrefTimer()

    if (this.#readsCorked) {
      this.#corkedReads.push({ type: 'end' })
      return
    }

    this.#clientEndPushed = true
    this.socket.push(null)
  }

  #onRealSocketClose = (hadError: boolean) => {
    /**
     * @note The connection is fully closed and the swapped handle
     * cannot shut down anymore. Report a synchronous shutdown so the
     * automatic "end()" of a half-closed socket ("allowHalfOpen: false")
     * finishes without errors once the consumer reads the end-of-stream.
     */
    if (this.#realHandleSwapped && this.socket._handle) {
      this.socket._handle.shutdown = () => 1
    }

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

    this.#emitClientClose(hadError)
  }

  /**
   * Emit the "close" event on the client socket, honoring the order
   * of the socket teardown events.
   * @note The client may be paused with the received data (and the
   * end-of-stream) still buffered. Node.js never emits "close" before
   * "end" on a gracefully closed connection: the teardown waits until
   * the consumer reads the buffered data.
   */
  #emitClientClose(hadError: boolean): void {
    if (
      this.#clientEndPushed &&
      !this.socket.readableEnded &&
      !this.socket.destroyed
    ) {
      let closeDelivered = false
      const deliverClose = (hadErrorOverride?: boolean) => {
        if (closeDelivered) {
          return
        }
        closeDelivered = true

        process.nextTick(() => {
          if (!this.#clientCloseEmitted) {
            this.socket.emit('close', hadErrorOverride ?? hadError)
          }
        })
      }

      this.socket.once('end', () => {
        deliverClose()
      })

      /**
       * @note The consumer may also destroy the socket before reading
       * the buffered data. Node.js still emits "close" for such
       * sockets, but the destroy machinery of a socket with a swapped
       * (already closed) handle never completes. Deliver "close" here.
       */
      const realDestroy = this.socket._destroy
      this.socket._destroy = (error, callback) => {
        deliverClose(error != null)
        return realDestroy.call(this.socket, error, callback)
      }
      return
    }

    this.socket.emit('close', hadError)
  }

  #onMockSocketDrain = () => {
    logger.verbose('client socket drained!')
    this.#passthroughSocket?.resume()
  }

  /**
   * Create a real connection with the original connection options.
   * The returned socket is exempt from interception.
   */
  public createRealConnection(): net.Socket {
    const realSocket = this.createConnection()
    realSocket[kPatched] = true
    return realSocket
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
   * Delegate the forwarding of the passthrough server's data to the
   * client to the given handler. Once set, the raw server bytes are no
   * longer pushed to the client automatically: the handler owns the
   * forwarding and may suppress or rewrite the data (e.g. the SMTP
   * interceptor gating individual replies). Pass `undefined` to restore
   * the default forwarding.
   */
  public onPassthroughRead(handler?: (chunk: Buffer) => void): void {
    this.#onPassthroughRead = handler
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
          this.#clientEndPushed = true
          this.socket.push(null)
          break
        }

        case 'close': {
          this.#emitClientClose(corkedRead.hadError)
          break
        }
      }
    }
  }

  public claim(): void {
    super.claim()

    /**
     * @note The client may destroy the socket before the connection
     * is claimed (e.g. abort a request in-flight). There is no
     * connection to mock then, and the destroyed socket has no handle.
     */
    if (this.socket.destroyed) {
      logger.verbose('socket already destroyed, skipping claim...')
      return
    }

    /**
     * @note Skip already connected sockets (e.g. kept-alive sockets
     * reused for the next exchange). Sockets with an emulated "connect"
     * only appear connected and must still complete the mock connection.
     */
    if (!this.socket.connecting && !this.#connectEmulated) {
      logger.verbose('socket already connected, skipping claim...')
      return
    }

    logger.verbose('-> claim!')

    /**
     * @note Reflect the local end of the claimed socket, the same way
     * the operating system reports the bound address of an outgoing
     * connection via "socket.address()"/"localAddress"/"localPort".
     * Patching the handle also prevents Node.js from handling the
     * "getsockname" errors of the never-connected raw handle.
     * @see https://github.com/nodejs/node/blob/13eb80f3b718452213e0fc449702aefbbfe4110f/lib/net.js#L971
     */
    this.socket._handle.getsockname = (addressInfo) => {
      Object.assign(
        addressInfo,
        getLocalAddressInfoByConnectionOptions(this.#connectionOptions)
      )
      return 0
    }

    /**
     * @note Reflect the connection target as the peer of the claimed
     * socket, the same way a connected socket reports the server it
     * connected to via "remoteAddress"/"remotePort"/"remoteFamily".
     */
    this.socket._handle.getpeername = (addressInfo) => {
      Object.assign(
        addressInfo,
        getAddressInfoByConnectionOptions(this.#connectionOptions)
      )
      return 0
    }

    this.#bufferedWrites = []

    // Release the buffered write payloads. They were already delivered
    // to the server socket, and there is nowhere else to flush them.
    this.socket._pendingData = null
    this.socket._pendingEncoding = ''

    this.pendingConnection.promise.then(([request, handle]) => {
      logger.verbose('connection request resolved, mocking the connection...')

      /**
       * @note "afterConnect" asserts that the socket is connecting.
       * Restore the flag if the connect was emulated earlier (emulation
       * flips it so its listeners observe a connected socket).
       * "afterConnect" itself sets it back to false.
       */
      if (this.#connectEmulated) {
        Reflect.set(this.socket, 'connecting', true)
      }

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

      const [, data, encoding, callback] = pendingWrite
      writePendingData(realSocket, data, encoding, callback)
    }

    this.#bufferedWrites = []
    this.socket._pendingData = null
    this.socket._pendingEncoding = ''

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
      .on('connectionAttemptFailed', this.#onRealSocketConnectionAttemptFailed)
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
  /**
   * @note The TLS connection options must be provided explicitly.
   * They cannot be captured from "socket.connect()" like for plain
   * TCP sockets because "tls.connect()" fixes them at the TLS socket
   * construction, before its transport ever connects.
   */
  #tlsConnectionOptions?: TlsConnectionOptions

  constructor(
    protected readonly socket: tls.TLSSocket,
    protected readonly createConnection: () => tls.TLSSocket,
    tlsConnectionOptions?: TlsConnectionOptions
  ) {
    super(socket, createConnection, tlsConnectionOptions)

    this.#tlsConnectionOptions = tlsConnectionOptions

    socket.prependListener('secureConnect', () => {
      /**
       * @note Reflect the negotiated ALPN protocol from the handle that
       * completed the handshake. The socket sets "alpnProtocol" only in
       * its own "_finishInit", which never runs for passthrough
       * connections (the handshake completes on the passthrough socket
       * whose handle this socket inherits).
       */
      socket.alpnProtocol = socket._handle.getALPNNegotiatedProtocol()
    })
  }

  protected emulateConnect(): void {
    super.emulateConnect()

    // For TLS sockets, also invoke the "secureConnect" callbacks since some consumers,
    // like Undici, listen to those to start writing to the socket.
    for (const listener of this.socket.rawListeners('secureConnect')) {
      listener.apply(this.socket)
    }
  }

  public claim(): void {
    /**
     * @note The client may destroy the socket before the connection
     * is claimed. Defer to the parent class, which transitions the
     * ready state and skips the mock connection of destroyed sockets.
     */
    if (this.socket.destroyed) {
      super.claim()
      return
    }

    /**
     * @note Reflect that the mocked connection is not authorized.
     * There is no real peer certificate to verify. The identity check
     * itself is skipped for claimed connections (see the
     * "isSessionReused" mock below).
     */
    this.socket.prependOnceListener('secureConnect', () => {
      Reflect.set(this.socket, 'authorized', false)
      Reflect.set(
        this.socket,
        'authorizationError',
        'MOCKED_CONNECTION_NOT_VERIFIED'
      )
    })

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

    /**
     * @note Skip the server identity check for this mocked connection.
     * Node.js runs "options.checkServerIdentity" in "onConnectSecure"
     * against the peer certificate, and a mocked connection has no
     * real peer certificate — the caller's (or the default) validation
     * would fail and destroy the socket. The check is overridden on the
     * socket's internal connect options since the emulated handshake
     * still completes through the regular "onConnectSecure" path.
     * @see https://github.com/nodejs/node/blob/3178a762d6a2b1a37b74f02266eea0f3d86603f1/lib/_tls_wrap.js#L1621
     */
    const realTlsConnectOptions = getTlsConnectOptions(this.socket)

    if (realTlsConnectOptions) {
      realTlsConnectOptions.checkServerIdentity = () => {
        return undefined
      }
    }

    handle.getCipher = () => {
      return {
        name: 'TLS_AES_256_GCM_SHA384',
        standardName: 'TLS_AES_256_GCM_SHA384',
        version: 'TLSv1.3',
      }
    }

    /**
     * Mock this to prevent a segfault on Node.js 26+. The native
     * implementation reads the negotiated group ("SSL_get0_group_name")
     * of a handshake that never happened. Node.js itself calls this
     * in "onConnectSecure" to validate the "minDHSize" option.
     * Reflect the ephemeral key exchange matching the mocked cipher.
     * @see https://github.com/nodejs/node/blob/3178a762d6a2b1a37b74f02266eea0f3d86603f1/lib/_tls_wrap.js#L1636
     */
    handle.getEphemeralKeyInfo = () => {
      return {
        type: 'ECDH',
        name: 'X25519',
        size: 253,
      }
    }

    const requestedAlpnProtocols = this.#tlsConnectionOptions?.ALPNProtocols

    if (
      Array.isArray(requestedAlpnProtocols) &&
      requestedAlpnProtocols.length > 0
    ) {
      const [preferredProtocol] = requestedAlpnProtocols

      /**
       * @note Reflect the client's preferred ALPN protocol as the
       * negotiated one. The mocked server accepts whatever the
       * client prefers.
       */
      handle.getALPNNegotiatedProtocol = () => {
        return typeof preferredProtocol === 'string' ? preferredProtocol : false
      }
    }

    this.socket.once('connect', () => {
      /**
       * @note A TLS 1.3 handshake derives five secrets, each reported
       * via a separate "keylog" event before the handshake completes.
       * Reflect them with mocked key material matching the mocked
       * cipher (SHA-384 secrets; the format is "LABEL <client random>
       * <secret>", each value hex-encoded).
       */
      const mockedClientRandom = '0'.repeat(64)
      const mockedSecret = '0'.repeat(96)
      const keylogLabels = [
        'SERVER_HANDSHAKE_TRAFFIC_SECRET',
        'EXPORTER_SECRET',
        'SERVER_TRAFFIC_SECRET_0',
        'CLIENT_HANDSHAKE_TRAFFIC_SECRET',
        'CLIENT_TRAFFIC_SECRET_0',
      ]

      for (const keylogLabel of keylogLabels) {
        this.socket.emit(
          'keylog',
          Buffer.from(`${keylogLabel} ${mockedClientRandom} ${mockedSecret}\n`)
        )
      }

      handle.onhandshakedone()

      /**
       * @note A TLS 1.3 server issues two session tickets by default,
       * each emitting a separate "session" event on the client.
       */
      handle.onnewsession(1, Buffer.from('mocked session'))
      handle.onnewsession(2, Buffer.from('mocked session'))
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
