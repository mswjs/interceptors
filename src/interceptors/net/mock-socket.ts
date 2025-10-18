import net from 'node:net'
import tls from 'node:tls'
import { Duplex } from 'node:stream'
import { Emitter, type EventMap } from 'strict-event-emitter'
import {
  normalizeSocketWriteArgs,
  type WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'
import { createSocketRecorder, type SocketRecorder } from './socket-recorder'

interface MockSocketConstructorOptions extends net.SocketConstructorOpts {
  secure?: boolean
  connectionCallback?: () => void
}

/**
 * A dummy `net.Socket` instance that allows observing written data packets
 * and records all consumer interactions to then replay them on the passthrough socket.
 * @note This instance is application protocol-agnostic.
 */
export class MockSocket extends net.Socket {
  public connecting: boolean

  constructor(protected readonly options: MockSocketConstructorOptions) {
    super(options)
    this.connecting = true

    if (options.connectionCallback) {
      this.once('connect', () => {
        options.connectionCallback?.()
      })
    }

    this._final = (callback) => callback(null)

    // this[kRecorder] = createSocketRecorder(this, {
    //   onEntry: (entry) => {
    //     if (
    //       entry.type === 'apply' &&
    //       ['runInternally', 'passthrough'].includes(entry.metadata.property)
    //     ) {
    //       return false
    //     }

    //     // Once the connection has been passthrough, replay any recorded events
    //     // on the passthrough socket immediately. No need to store them.
    //     if (this[kPassthroughSocket]) {
    //       entry.replay(this[kPassthroughSocket])
    //       return false
    //     }
    //   },
    //   resolveGetterValue: (target, property) => {
    //     // Once the socket has been passthrough, resolve any getters
    //     // against the passthrough socket, not the mock socket.
    //     if (this[kPassthroughSocket]) {
    //       return this[kPassthroughSocket][property as keyof net.Socket]
    //     }
    //   },
    // })
    // return this[kRecorder].socket
  }

  public mockConnect() {
    queueMicrotask(() => {
      this.connecting = false
      this.emit('connect')
    })

    return this
  }
}

//
//
//

export class SocketController<SocketType extends net.Socket> {
  public socket: SocketType

  #subscriptions: Array<() => void>
  #recorder: SocketRecorder<SocketType>
  #passthroughSocket?: SocketType

  public on: Emitter<SocketProxyEvents>['on']
  public once: Emitter<SocketProxyEvents>['once']

  constructor(
    protected readonly options: {
      socket: SocketType
      proxy: DuplexStreamProxy
      createConnection: () => SocketType
    }
  ) {
    this.on = options.proxy.on.bind(options.proxy)
    this.once = options.proxy.once.bind(options.proxy)

    this.#subscriptions = []
    this.#recorder = createSocketRecorder(options.socket, {
      onEntry(entry) {
        if (
          entry.type === 'apply' &&
          ['runInternally', 'passthrough'].includes(entry.metadata.property)
        ) {
          return false
        }

        /**
         * @todo Finish this for passthrough.
         */
        throw new Error('Tests fail because of this')
      },
    })

    this.socket = this.#recorder.socket
  }

  public runInternally(callback: (socket: SocketType) => void): void {
    /**
     * @fixme While extremely unlikely, this method can be called
     * after `.free()` was called and the recorder must not resume.
     * This will resume it. No-op. `this.#recorder.readyState`?
     */

    try {
      this.#recorder.pause()
      callback(this.socket)
    } finally {
      this.#recorder.resume()
    }
  }

  public passthrough(): SocketType {
    const socket = this.options.createConnection()
    this.#recorder.replay(socket)
    this.#passthroughSocket = socket
    return socket
  }

  public free(): void {
    this.#recorder.pause()
    this.#recorder.free()

    let disposeCallback: (() => void) | undefined
    while ((disposeCallback = this.#subscriptions.shift())) {
      disposeCallback?.()
    }
  }
}

interface SocketProxyEvents extends EventMap {
  write: [
    chunk: string | Buffer | null,
    encoding?: BufferEncoding,
    callback?: () => void
  ]
}

/**
 * Adds an in-place proxy over the given streams's `.write()` and `.end()`.
 */
export class DuplexStreamProxy extends Emitter<SocketProxyEvents> {
  public dispose: () => void

  constructor(socket: Duplex) {
    super()

    const originalWrite = socket.write.bind(socket)
    const originalEnd = socket.end.bind(socket)

    socket.write = (...args: Array<unknown>) => {
      if (this.listenerCount('write') > 0) {
        const [chunk, encoding, callback] = normalizeSocketWriteArgs(
          args as WriteArgs
        )
        this.emit('write', chunk, encoding, callback)
      }
      return Reflect.apply(originalWrite, socket, args)
    }

    socket.end = (...args: Array<unknown>) => {
      if (this.listenerCount('write') > 0) {
        const [chunk, encoding, callback] = normalizeSocketWriteArgs(
          args as WriteArgs
        )
        this.emit('write', chunk, encoding, callback)
      }
      return Reflect.apply(originalEnd, socket, args)
    }

    this.dispose = () => {
      socket.write = originalWrite
      socket.end = originalEnd
    }
  }
}

export class MockTlsSocket extends tls.TLSSocket {
  public connecting: boolean

  constructor(
    underlyingSocket: MockSocket,
    protected readonly options: tls.ConnectionOptions,
    secureConnectionListener?: () => void
  ) {
    super(underlyingSocket, options)
    this.connecting = true

    this.once('connect', () => {
      process.nextTick(() => {
        // Complete the handshake so the socket finishes the connection
        // (e.g. emits the "secure" and "session" events).
        this.mockHandshake()
      })
    })

    this.once('secure', this.mockSecureConnect.bind(this))

    if (secureConnectionListener) {
      this.once('secureConnect', secureConnectionListener)
    }

    process.nextTick(() => {
      underlyingSocket.mockConnect()
    })
  }

  private mockHandshake(): void {
    /**
     * Triggers the `_finishInit()` hook and emits "secure".
     * @see https://github.com/nodejs/node/blob/a73b575304722a3682fbec3a5fb13b39c5791342/lib/internal/tls/wrap.js#L1050
     */
    // @ts-expect-error Node.js internals.
    this._handle.onhandshakedone?.()
  }

  private mockSecureConnect(): void {
    process.nextTick(() => {
      this.emit('secureConnect')

      if (this.options.session) {
        this.emit('session', this.options.session)
      }
    })
  }
}
