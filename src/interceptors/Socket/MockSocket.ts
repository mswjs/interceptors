import net from 'node:net'
import {
  normalizeWriteArgs,
  type WriteArgs,
  type WriteCallback,
} from './utils/normalizeWriteArgs'

export interface MockSocketOptions {
  write: (
    chunk: Buffer | string,
    encoding: BufferEncoding | undefined,
    callback?: WriteCallback
  ) => void

  read: (chunk: Buffer, encoding: BufferEncoding | undefined) => void
}

export class MockSocket extends net.Socket {
  public connecting: boolean

  constructor(protected readonly options: MockSocketOptions) {
    super()
    this.connecting = false
    this.connect()
  }

  public connect() {
    // The connection will remain pending until
    // the consumer decides to handle it.
    this.connecting = true
    return this
  }

  public write(...args: Array<unknown>): boolean {
    const [chunk, encoding, callback] = normalizeWriteArgs(args as WriteArgs)
    this.options.write(chunk, encoding, callback)
    return true
  }

  public end(...args: Array<unknown>) {
    const [chunk, encoding, callback] = normalizeWriteArgs(args as WriteArgs)
    this.options.write(chunk, encoding, callback)

    return super.end.apply(this, args as any)
  }

  public push(chunk: any, encoding?: BufferEncoding): boolean {
    this.options.read(chunk, encoding)

    if (chunk !== null) {
      this.emit('data', chunk)
    } else {
      this.emit('end')
    }

    return true
  }
}
