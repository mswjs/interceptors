import { Socket } from 'net'
import { RequestOptions } from 'https'
import { EventEmitter } from 'events'

interface SocketOptions {
  usesHttps: boolean
}

export class SocketPolyfill extends EventEmitter implements Socket {
  // @ts-expect-error
  [Symbol.asyncIterator](): AsyncIterableIterator<any> {}

  authorized: boolean = false
  bufferSize: number
  writableLength: number
  writable: boolean
  readable: boolean
  pending: boolean
  destroyed: boolean
  connecting: boolean
  totalDelayMs: number
  timeoutMs: number | null

  remoteFamily: 'IPv4' | 'IPv6'
  localAddress: string
  localPort: number
  remoteAddress: string
  remotePort: number

  bytesRead = 0
  bytesWritten = 0
  writableCorked = 0
  writableEnded = false
  writableFinished = false
  writableHighWaterMark = 0
  writableObjectMode = true
  readableEncoding = null
  readableEnded = false
  readableFlowing = false
  readableHighWaterMark = 0
  readableLength = 0
  readableObjectMode = true

  constructor(options: RequestOptions, socketOptions: SocketOptions) {
    super()

    if (socketOptions.usesHttps) {
      this.authorized = true
    }

    this.bufferSize = 0
    this.writableLength = 0
    this.writable = true
    this.readable = true
    this.pending = false
    this.destroyed = false
    this.connecting = false
    this.totalDelayMs = 0
    this.timeoutMs = null

    const ipv6 = options.family === 6
    this.remoteFamily = ipv6 ? 'IPv6' : 'IPv4'
    this.localAddress = this.remoteAddress = ipv6 ? '::1' : '127.0.0.1'
    this.localPort = this.remotePort = this.resolvePort(options.port)
  }

  setDefaultEncoding() {
    return this
  }

  isPaused() {
    return false
  }

  resolvePort(port: RequestOptions['port']): number {
    if (port == null) {
      return 0
    }

    if (typeof port === 'number') {
      return port
    }

    return parseInt(port)
  }

  address() {
    return {
      port: this.remotePort,
      family: this.remoteFamily,
      address: this.remoteAddress,
    }
  }

  applyDelay(duration: number) {
    this.totalDelayMs += duration

    if (this.timeoutMs && this.totalDelayMs > this.timeoutMs) {
      this.emit('timeout')
    }
  }

  /**
   * Enable/disable the use of Nagle's algorithm.
   * Nagle's algorithm delays data before it is sent via the network.
   */
  setNoDelay(noDelay: boolean = true) {
    if (noDelay) {
      this.totalDelayMs = 0
    }

    return this
  }

  /**
   * Enable/disable keep-alive functionality, and optionally set the initial delay before
   * the first keepalive probe is sent on an idle socket.
   */
  setKeepAlive() {
    return this
  }

  setTimeout(timeout: number, callback?: () => void) {
    const timer = setTimeout(() => {
      callback?.()
      this.emit('timeout')
    }, timeout)

    // Unref the timer in Node.js so the process won't hang on exit if long
    // timeouts were used.
    if (typeof timer.unref === 'function') {
      timer.unref()
    }

    return this
  }

  getPeerCertificate() {
    return Buffer.from(
      (Math.random() * 10000 + Date.now()).toString()
    ).toString('base64')
  }

  destroy(error: Error) {
    this.destroyed = true
    this.readable = this.writable = false

    if (error) {
      this.emit('error', error)
    }

    return this
  }
  _destroy(error: Error) {
    this.destroy(error)
  }

  _final() {}

  read() {}
  _read() {}

  connect() {
    return this
  }

  ref() {
    return this
  }

  unref() {
    return this
  }

  pipe() {
    return this as any
  }

  unpipe() {
    return this
  }

  unshift() {}
  wrap() {
    return this
  }
  push() {
    return false
  }

  setEncoding() {
    return this
  }

  // Mock methods required to write to the response body.
  write() {
    return false
  }
  _write() {}
  _writev() {}

  pause() {
    return this
  }

  resume() {
    return this
  }

  cork() {}

  uncork() {}

  end() {}
}
