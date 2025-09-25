import net from 'node:net'
import {
  normalizeSocketWriteArgs,
  type WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'
import { createSocketRecorder, type SocketRecorder } from './socket-recorder'

interface MockSocketConstructorOptions extends net.SocketConstructorOpts {
  secure?: boolean
  createConnection: () => net.Socket
  connectionCallback?: () => void
}

const kRecorder = Symbol('kRecorder')
const kPassthroughSocket = Symbol('kPassthroughSocket')

/**
 * A dummy `net.Socket` instance that allows observing written data packets
 * and records all consumer interactions to then replay them on the passthrough socket.
 * @note This instance is application protocol-agnostic.
 */
export class MockSocket extends net.Socket {
  public connecting: boolean;

  [kRecorder]: SocketRecorder<MockSocket>;
  [kPassthroughSocket]?: net.Socket

  constructor(protected readonly options: MockSocketConstructorOptions) {
    super(options)
    this.connecting = false

    this.once('connect', () => {
      this.connecting = false
      this.options?.connectionCallback?.()
    })

    this._final = (callback) => callback(null)

    this[kRecorder] = createSocketRecorder(this, {
      onEntry: (entry) => {
        if (
          entry.type === 'apply' &&
          ['runInternally', 'passthrough'].includes(entry.metadata.property)
        ) {
          return false
        }

        // Once the connection has been passthrough, replay any recorded events
        // on the passthrough socket immediately. No need to store them.
        if (this[kPassthroughSocket]) {
          entry.replay(this[kPassthroughSocket])
          return false
        }
      },
      resolveGetterValue: (target, property) => {
        // Once the socket has been passthrough, resolve any getters
        // against the passthrough socket, not the mock socket.
        if (this[kPassthroughSocket]) {
          return this[kPassthroughSocket][property as keyof net.Socket]
        }
      },
    })

    return this[kRecorder].socket
  }

  public connect() {
    this.connecting = true

    queueMicrotask(() => {
      this.emit('connect')
    })

    return this
  }

  public write(...args: any): boolean {
    const [chunk, encoding, callback] = normalizeSocketWriteArgs(
      args as WriteArgs
    )
    this.runInternally(() => {
      this.emit('write', chunk, encoding, callback)
    })
    return true
  }

  public push(chunk: any, encoding?: BufferEncoding): boolean {
    this.runInternally(() => {
      this.emit('push', chunk, encoding)
    })
    return super.push(chunk, encoding)
  }

  public end(...args: any) {
    const [chunk, encoding, callback] = normalizeSocketWriteArgs(
      args as WriteArgs
    )
    this.runInternally(() => {
      this.emit('write', chunk, encoding, callback)
    })
    return super.end.apply(this, args)
  }

  /**
   * Invokes the given callback without its actions being recorded.
   * Use this for internal logic that must not be replayed on the passthrough socket.
   */
  public runInternally(callback: () => void) {
    try {
      this[kRecorder].pause()
      callback()
    } finally {
      this[kRecorder].resume()
    }
  }

  /**
   * Establishes the actual connection behind this socket.
   * Replays all the consumer interaction on the passthrough socket
   * and mirrors all the subsequent mock socket interactions onto the passthrough socket.
   */
  public passthrough(): net.Socket {
    const socket = this.options.createConnection()
    this[kRecorder].replay(socket)
    this[kPassthroughSocket] = socket
    return socket
  }
}
