import { Duplex } from 'stream'
import { invariant } from 'outvariant'

export const kOtherSide = Symbol('kOtherSide')
const kCallback = Symbol('kCallback')

export class DuplexPair {
  public clientSide: DuplexSocket
  public serverSide: DuplexSocket

  constructor() {
    this.clientSide = new DuplexSocket()
    this.serverSide = new DuplexSocket()
    this.clientSide[kOtherSide] = this.serverSide
    this.serverSide[kOtherSide] = this.clientSide
  }
}

export class DuplexSocket extends Duplex {
  private [kOtherSide]?: DuplexSocket
  private [kCallback]?: () => void

  _read() {
    const callback = this[kCallback]
    if (callback) {
      this[kCallback] = undefined
      callback()
    }
  }

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: () => void
  ) {
    const otherSide = this[kOtherSide]
    invariant(otherSide, 'Must have other side')

    if (chunk.length === 0) {
      process.nextTick(callback)
    } else {
      otherSide.push(chunk)
      otherSide[kCallback] = callback
    }
  }

  _final(callback: () => void): void {
    const otherSide = this[kOtherSide]
    invariant(otherSide, 'Must have other side')
    otherSide.on('end', callback)
    otherSide.push(null)
  }
}
