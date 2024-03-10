import net from 'node:net'
import {
  normalizeWriteArgs,
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
    console.log('MockSocket.connect()')

    // The connection will remain pending until
    // the consumer decides to handle it.
    this.connecting = true
    return this
  }

  public write(...args: Array<unknown>): boolean {
    const [chunk, encoding, callback] = normalizeWriteArgs(args)
    console.log('MockSocket.write()', chunk.toString())

    this.options.write(chunk, encoding, callback)
    return false
  }

  public end(...args: Array<unknown>) {
    console.log('MockSocket.end()', args)

    const [chunk, encoding, callback] = normalizeWriteArgs(args)
    this.options.write(chunk, encoding, callback)

    return super.end.apply(this, args)
  }

  public push(chunk: any, encoding?: BufferEncoding): boolean {
    console.log('MockSocket.push()', { chunk: chunk?.toString(), encoding })

    this.options.read(chunk, encoding)

    if (chunk !== null) {
      this.emit('data', chunk)
    } else {
      this.emit('end')
    }

    return true
  }
}
