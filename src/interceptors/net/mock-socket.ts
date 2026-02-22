import net from 'node:net'
import tls from 'node:tls'
import { toBuffer } from '../../utils/bufferUtils'
import { createLogger } from '../../utils/logger'
import { unwrapPendingData } from './utils/flush-writes'
import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { kRawSocket, TcpHandle, TcpWrap } from './connection-controller'
import EventEmitter from 'node:events'

const kListenerWrap = Symbol('kListenerWrap')

export const kMockState = Symbol('kMockState')
export const kTlsSocket = Symbol('kTlsSocket')

const log = createLogger('MockSocket')

export class MockSocket extends net.Socket {
  static PENDING = 0 as const
  static MOCKED = 1 as const
  static PASSTHROUGH = 2 as const

  private [kMockState]: 0 | 1 | 2
  private [kTlsSocket]?: tls.TLSSocket

  public connecting: boolean

  constructor(options: net.SocketConstructorOpts) {
    super(options)

    this[kMockState] = 0

    /**
     * @note Start the socket in the connecting state.
     * This will make Node.js buffer any writes to this socket automatically.
     */
    this.connecting = true

    log('constructed new instance')
  }

  _read(size: number): void {
    log('read', size)
  }

  /**
   * Override "_writeGeneric" to benefit from built-in chunk buffering in Node.js.
   * That's also the baseline method for both "write" and "writev".
   * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L994
   */
  _writeGeneric(
    writev: boolean,
    data: Array<any> | any,
    encoding: BufferEncoding,
    callback?: ((error?: Error | null) => void) | undefined
  ): void {
    log({ connecting: this.connecting, data, encoding, callback }, 'write')

    const emitWrite = () => {
      unwrapPendingData(data, (chunk, encoding) => {
        this.emit('internal:write', chunk, encoding)
      })
    }

    // While connecting, the socket is in ambiguous state.
    // Buffer the writes using Node's existing buffering logic.
    if (this.connecting) {
      super._writeGeneric(writev, data, encoding, callback)
      emitWrite()
      return
    }

    if (this[kMockState] === MockSocket.MOCKED) {
      /**
       * Handle "_writeGeneric" calls scheduled after the "connect" event.
       * These are writes performed while connecting, and for the mocked socket
       * they must be ignored. There's nowhere to flush them. Calling "_writeGeneric"
       * past this point will result in "Error: write EBADF".
       * @see https://github.com/nodejs/node/blob/main/deps/uv/src/unix/stream.c#L1304-L1305
       */
      if (this._pendingData) {
        log(this._pendingData, 'mocked connection, clearing write buffer')

        this._pendingData = null
        this._pendingEncoding = null
        return
      }

      emitWrite()
      return
    }

    super._writeGeneric(writev, data, encoding, callback)
  }
}

/**
 * Create a proxy `net.Socket` instance that represents the intercepted socket server-side.
 * This is the reference exposed as `socket` in the connection listener. This proxy allows
 * the user to interact with `socket` from the server's perspective (e.g. `socket.write()`
 * on the server translates to the `socket.push()` on the client).
 */
export function toServerSocket<T extends net.Socket>(socket: T): T {
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

abstract class SocketController<T extends net.Socket> extends EventEmitter {
  static PENDING = 0 as const
  static MOCKED = 1 as const
  static PASSTHROUGH = 2 as const

  protected readyState:
    | typeof SocketController.PENDING
    | typeof SocketController.MOCKED
    | typeof SocketController.PASSTHROUGH

  constructor() {
    super()
    this.readyState = SocketController.PENDING
  }

  public abstract claim(): void
  public abstract passthrough(): T
}

export class TcpSocketController extends SocketController<net.Socket> {
  public serverSocket: net.Socket
  private [kRawSocket]: net.Socket

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket
  ) {
    super()

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => void 0

    this.socket.prependOnceListener('connectionAttempt', () => {
      const tlsHandle = this.socket._handle
      const tcpHandle = tlsHandle._parent

      if (tcpHandle == null) {
        return
      }

      tcpHandle.connect = tcpHandle.connect6 = (request) => {
        this.emit('internal:connect', request, tcpHandle)
        // this.#pendingConnection.resolve([request, tcpHandle])
      }
    })

    const realWriteGeneric = this.socket._writeGeneric

    this.socket._writeGeneric = (...args) => {
      if (this.readyState === SocketController.PENDING) {
        unwrapPendingData(args[1], (chunk, encoding) => {
          this.socket.emit('internal:write', chunk, encoding)
        })
      }

      return realWriteGeneric.apply(this.socket, args)
    }

    this[kRawSocket] = socket
    this.serverSocket = toServerSocket(this.socket)
  }

  public claim(): void {
    invariant(
      this.readyState !== SocketController.MOCKED,
      'Failed to claim a TLS socket: already claimed'
    )

    this.readyState = SocketController.MOCKED

    this.on('internal:connect', (request: TcpWrap, handle: TcpHandle) => {
      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, handle, request, true, true)
    })
  }

  public passthrough(): net.Socket {
    invariant(
      this.readyState !== SocketController.PASSTHROUGH,
      'Failed to passthrough a TLS socket: already passthrough'
    )

    this.readyState = SocketController.PASSTHROUGH

    const realSocket = this.createConnection()

    this.socket.on('drain', () => realSocket.resume())

    this.socket.write = realSocket.write.bind(realSocket)
    this.socket.read = realSocket.read.bind(realSocket)

    realSocket
      .once('connect', () => {
        this.socket._handle = realSocket._handle

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

        this.socket.connecting = false
        this.socket.emit('connect')
        this.socket.emit('ready')
      })
      .on('data', (data) => {
        if (!this.socket.push(data)) {
          realSocket.pause()
        }
      })
      .on('error', (error) => {
        this.socket.destroy(error)
      })
      .on('end', () => {
        this.socket.push(null)
      })

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
    this.prependListener('internal:connect', () => {
      /**
       * Mock this to prevent the "Error: Worker exited unexpectedly" error.
       * This will trigger when "secure" is emitted.
       * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L1648
       */
      this.socket._handle.verifyError = () => void 0

      this.socket._handle.start = () => {
        /**
         * Mock a successful SSL handshake.
         * This will emit "secureConnect" and "secure" on the TLS socket and trigger "tlsSocket._finishInit".
         * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L878
         */
        this.socket._handle.onhandshakedone()
        this.socket._handle.onnewsession(1, Buffer.alloc(0))
      }
    })

    super.claim()
  }

  public passthrough(): tls.TLSSocket {
    const realSocket = super.passthrough() as tls.TLSSocket

    realSocket
      .on('secure', () => {
        this.socket.emit('secure')
      })
      .on('session', (...args) => {
        this.socket.emit('session', ...args)
      })
      .on('secureConnect', () => {
        if (this.socket._pendingData) {
          unwrapPendingData(this.socket._pendingData, (chunk, encoding) => {
            realSocket.write(chunk, encoding)
          })
        }
      })

    return realSocket
  }
}
