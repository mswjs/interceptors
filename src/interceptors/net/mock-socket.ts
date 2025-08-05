import net from 'node:net'
import {
  normalizeSocketWriteArgs,
  type WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'
import { createSocketRecorder, type SocketRecorder } from './socket-recorder'

interface MockSocketConstructorOptions extends net.SocketConstructorOpts {
  createConnection: () => net.Socket
  onConnect?: () => void
}

/**
 * A dummy `net.Socket` instance that allows observing written data packets
 * and records all consumer interactions to then replay them on the passthrough socket.
 * @note This instance is application protocol-agnostic.
 */
export class MockSocket extends net.Socket {
  public connecting: boolean

  #recorder: SocketRecorder<MockSocket>
  #passthroughSocket?: net.Socket

  constructor(protected readonly options: MockSocketConstructorOptions) {
    super(options)
    this.connecting = false
    this.connect()

    this._final = (callback) => callback(null)

    this.once('connect', () => {
      if (!this.#passthroughSocket) {
        this.options.onConnect?.()
        this.connecting = false
      }
    })

    this.#recorder = createSocketRecorder(this, {
      onEntry: (entry) => {
        // Once the connection has been passthrough, replay any recorded events
        // on the passthrough socket immediately. No need to store them.
        if (this.#passthroughSocket) {
          entry.replay(this.#passthroughSocket)
          return false
        }

        return true
      },
      resolveGetterValue: (target, property) => {
        // Once the socket has been passthrough, resolve any getters
        // against the passthrough socket, not the mock socket.
        if (this.#passthroughSocket) {
          return this.#passthroughSocket[property as keyof net.Socket]
        }
      },
    })
    return this.#recorder.socket
  }

  public connect() {
    this.connecting = true
    return this
  }

  public write(...args: any): boolean {
    const [chunk, encoding, callback] = normalizeSocketWriteArgs(
      args as WriteArgs
    )
    this.emit('write', chunk, encoding, callback)
    return true
  }

  public push(chunk: any, encoding?: BufferEncoding): boolean {
    this.emit('push', chunk, encoding)
    return super.push(chunk, encoding)
  }

  public end(...args: any) {
    const [chunk, encoding, callback] = normalizeSocketWriteArgs(
      args as WriteArgs
    )
    this.emit('write', chunk, encoding, callback)
    return super.end.apply(this, args)
  }

  /**
   * Establishes the actual connection behind this socket.
   * Replays all the consumer interaction on the passthrough socket
   * and mirrors all the subsequent mock socket interactions onto the passthrough socket.
   */
  public passthrough(): void {
    const socket = this.options.createConnection()
    this.#recorder.replay(socket)
    this.#passthroughSocket = socket
  }
}
