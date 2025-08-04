import net from 'node:net'
import {
  normalizeSocketWriteArgs,
  type WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'
import { createSocketRecorder, type SocketRecorder } from './socket-recorder'

/**
 * A dummy `net.Socket` instance that allows observing written data packets
 * and records all consumer interactions to then replay them on the passthrough socket.
 * @note This instance is application protocol-agnostic.
 */
export class MockSocket extends net.Socket {
  public connecting: boolean

  #recorder: SocketRecorder<MockSocket>

  constructor(protected readonly options?: net.SocketConstructorOpts) {
    super(options)
    this.connecting = false
    this.connect()

    this._final = (callback) => callback(null)

    this.#recorder = createSocketRecorder(this)
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

  public passthrough(): net.Socket {
    /**
     * @fixme Get the means of creating a passthrough socket instance.
     */
    const socket = foo(this.options)
    this.#recorder.replay(socket)

    /**
     * @todo Implement the inverse recorder: changes on the passthrough socket
     * must be reflected on this MockSocket. Consumers getting properties from
     * this MockSocket must receive their values from the passthrough socket.
     */

    return socket
  }
}
