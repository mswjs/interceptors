import { RequestOptions } from 'https'
import { EventEmitter } from 'events'

interface SocketOptions {
  usesHttps: boolean
}

export class Socket extends EventEmitter {
  public authorized?: boolean
  public bufferSize: number
  public writableLength: number
  public writable: boolean
  public readable: boolean
  public pending: boolean
  public destroyed: boolean
  public connecting: boolean
  public totalDelayMs: number
  public timeoutMs: number | null
  public remoteFamily: 'IPv4' | 'IPv6'
  public localAddress: string
  public localPort: number
  public remoteAddress: string
  public remotePort: number

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

  getPeerCertificate() {
    return Buffer.from(
      (Math.random() * 10000 + Date.now()).toString()
    ).toString('base64')
  }

  resume() {}
  cork() {}
  uncork() {}

  destroy(error: Error) {
    this.destroyed = true
    this.readable = this.writable = false

    if (error) {
      this.emit('error', error)
    }

    return this
  }
}
