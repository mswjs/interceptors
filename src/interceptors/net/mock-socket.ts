import net from 'node:net'
import tls from 'node:tls'
import EventEmitter from 'node:events'
import { invariant } from 'outvariant'
import { toBuffer } from '../../utils/bufferUtils'
import { createLogger } from '../../utils/logger'
import { unwrapPendingData } from './utils/flush-writes'
import { kRawSocket, TcpHandle, TcpWrap } from './connection-controller'
import { SocketInterceptor } from '.'
import { DeferredPromise } from '@open-draft/deferred-promise'

const kListenerWrap = Symbol('kListenerWrap')

export const kMockState = Symbol('kMockState')
export const kTlsSocket = Symbol('kTlsSocket')

const log = createLogger('MockSocket')

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

  constructor() {
    this.readyState = SocketController.PENDING
  }

  public claim(): void {
    invariant(
      this.readyState !== SocketController.MOCKED,
      'Failed to claim a TLS socket: already claimed'
    )

    this.readyState = SocketController.MOCKED
  }

  public passthrough() {
    invariant(
      this.readyState !== SocketController.PASSTHROUGH,
      'Failed to passthrough a TLS socket: already passthrough'
    )

    this.readyState = SocketController.PASSTHROUGH
  }
}

export class TcpSocketController extends SocketController {
  public serverSocket: net.Socket
  private [kRawSocket]: net.Socket

  protected pendingConnection: DeferredPromise<[TcpWrap, TcpHandle]>

  constructor(
    protected readonly socket: net.Socket,
    protected readonly createConnection: () => net.Socket
  ) {
    super()

    this.pendingConnection = new DeferredPromise()

    // Implement the read method to prevent the "Error: read ENOTCONN" errors on non-existing hosts.
    this.socket._read = () => void 0

    this.socket.prependOnceListener('connectionAttempt', () => {
      const handle = this.socket._handle

      handle.connect = handle.connect6 = (request) => {
        this.pendingConnection.resolve([request, handle])
      }
    })

    const realWriteGeneric = this.socket._writeGeneric

    this.socket._writeGeneric = (...args) => {
      const emitWrite = () => {
        unwrapPendingData(args[1], (chunk, encoding) => {
          this.socket.emit('internal:write', chunk, encoding)
        })
      }

      if (this.readyState === SocketController.PENDING) {
        emitWrite()
        return realWriteGeneric.apply(this.socket, args)
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
          return
        }

        emitWrite()
        return
      }

      return realWriteGeneric.apply(this.socket, args)
    }

    this[kRawSocket] = socket
    this.serverSocket = toServerSocket(this.socket)
  }

  public claim(): void {
    super.claim()

    this.pendingConnection.then(([request, handle]) => {
      /**
       * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1142
       */
      request.oncomplete(0, handle, request, true, true)
    })
  }

  public passthrough(): net.Socket {
    super.passthrough()

    const realSocket = this.createConnection()

    this.socket.on('drain', () => realSocket.resume())

    this.socket.write = realSocket.write.bind(realSocket)
    this.socket.read = realSocket.read.bind(realSocket)

    realSocket
      .once('connect', () => {
        this.socket._handle = realSocket._handle

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
    // Add this callback before "super.claim()" so it executes first.
    // TLSWrap methods have to be patched before TCPWrap fires "oncomplete".
    this.pendingConnection.then(() => {
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
