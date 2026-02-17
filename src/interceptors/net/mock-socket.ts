import net from 'node:net'

export class MockSocket extends net.Socket {
  public connecting: boolean

  constructor(options: net.SocketConstructorOpts, onConnect?: () => void) {
    super({ ...options, allowHalfOpen: true })
    this.connecting = true

    if (onConnect) {
      this.on('connect', onConnect)
    }
  }

  public mockConnect() {
    queueMicrotask(() => {
      this.connecting = false
      this.emit('connect')
    })

    return this
  }

  // Override _writeGeneric to prevent "Socket is closed" errors
  // when the socket tries to flush buffered data during connect
  // @ts-ignore - overriding private method
  public _writeGeneric(
    writev: boolean,
    data: any,
    encoding?: any,
    callback?: any
  ) {
    // If the socket is not properly initialized with a handle,
    // just call the callback without trying to write
    // @ts-ignore - accessing private property
    if (!this._handle) {
      if (typeof callback === 'function') {
        process.nextTick(callback)
      }

      return
    }

    // Otherwise, call the parent implementation
    // @ts-ignore - calling private method
    return super._writeGeneric(writev, data, encoding, callback)
  }
}
