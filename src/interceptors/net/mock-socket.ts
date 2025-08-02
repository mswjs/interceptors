import net from 'node:net'
import {
  normalizeSocketWriteArgs,
  WriteArgs,
} from '../Socket/utils/normalizeSocketWriteArgs'

export class MockSocket extends net.Socket {
  public connecting: boolean

  constructor() {
    super()
    this.connecting = false
    this.connect()

    this._final = (callback) => callback(null)
  }

  public connect() {
    this.connecting = true
    return this
  }

  public write(...args: Array<unknown>): boolean {
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

  public end(...args: Array<unknown>) {
    const [chunk, encoding, callback] = normalizeSocketWriteArgs(
      args as WriteArgs
    )
    this.emit('write', chunk, encoding, callback)
    return super.end.apply(this, args as any)
  }
}
