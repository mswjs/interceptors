import net from 'node:net'

type ErrorStatus = 0 | 1

declare module 'node:net' {
  interface Socket {
    _handle: {
      open: (fd: unknown) => ErrorStatus
      connect: (request: TcpWrap, address: string, port: number) => void
      listen: (backlog: number) => ErrorStatus
      onconnection?: () => void
      getpeername?: () => ErrorStatus
      getsockname?: () => ErrorStatus
      reading: boolean
      onread: () => {}
      readStart: () => void
      readStop: () => void
      bytesRead: number
      bytesWritten: number
      ref?: () => void
      unref?: () => void
      fchmod: (mode: number) => void
      setBlocking: (blocking: boolean) => ErrorStatus
      setNoDelay?: (noDelay: boolean) => void
      setKeepAlive?: (keepAlive: boolean, initialDelay: number) => void
      shutdown: (reqest: unknown /* ShutdownWrap */) => ErrorStatus
      close: () => void
    }
  }
}

interface TcpWrap {
  oncomplete: (
    status: ErrorStatus,
    owner: any,
    request: TcpWrap,
    readable?: boolean,
    writable?: boolean
  ) => void
}

export class NewMockSocket extends net.Socket {
  public connecting: boolean

  constructor(options: net.SocketConstructorOpts) {
    super(options)
    this.connecting = false
  }

  /**
   * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1281
   */
  public connect(...args: SocketConnectArgs): this {
    // this.connecting = true
    // this.#connectionOptions = args

    // if (connectionCallback != null) {
    //   this.on('connect', connectionCallback)
    // }

    // process.nextTick(() => {
    //   this.connecting = false
    //   this.emit('connect')
    // })
    //
    const [options, connectionCallback] = normalizeSocketConnectArgs(args)

    // options.lookup = (hostname, options, callback) => {
    //   console.log('DNS LOOKUP!', hostname, options, callback)

    //   this.emit('lookup', null, 'ip', 'addressType', 'host')
    //   this.emit('connectionAttempt', 'address', 'port', 'addressType')

    //   process.nextTick(() => {
    //     this.connecting = false
    //     this.emit('connect')
    //   })
    // }

    this.on('connectionAttempt', () => {
      // Patch the TCPWrap handle set only after the connection attempt.
      this._handle.connect = (tcpWrap, address, port) => {
        console.log('HANDLE CONNECT!', tcpWrap, address, port)

        /**
         * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L1649
         */
        tcpWrap.oncomplete(0, this._handle, tcpWrap, true, true)
      }

      this._handle.readStart = () => {
        console.log('READ!')
      }
    })

    return super.connect(...args)
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    console.log('WRITE!', chunk)
    callback(null)
  }

  /**
   * Establish this socket connection as-is.
   */
  public passthrough(): void {
    // super.connect(this.#connectionOptions)
    /** @todo Replay any writes or changes onto the passthrough socket */
  }
}

type SocketConnectArgs =
  | [options: net.NetConnectOpts, connectionListener?: () => void]
  | [port: number, host: string, connectionListener?: () => void]
  | [port: number, connectionListener?: () => void]
  | [path: string, connectionListener?: () => void]
  | []

type NormalizdeSocketConnectArgs = [
  options: {
    host?: string
    port?: number
    path?: string
  },
  connectionListener: (() => void) | null,
]

function normalizeSocketConnectArgs(
  args: SocketConnectArgs
): NormalizdeSocketConnectArgs {
  if (args.length === 0) {
    return [{}, null]
  }

  let result: NormalizdeSocketConnectArgs = [{}, null]
  let options: NormalizdeSocketConnectArgs[0] = {}
  const [arg0] = args

  if (typeof arg0 === 'object' && arg0 !== null) {
    options = arg0
  } else if (typeof arg0 === 'string' && isNaN(Number(arg0))) {
    options.path = arg0
  } else {
    options.port = Number(arg0)

    if (args.length > 1 && typeof args[1] === 'string') {
      options.host = args[1]
    }
  }

  const callback = args[args.length - 1]
  if (typeof callback === 'function') {
    result = [options, callback]
  } else {
    result = [options, null]
  }

  return result
}

const kRealConnect = Symbol('kRealConnect')
const kConnectArgs = Symbol('kConnectArgs')

class NewSocketController {
  constructor(private readonly socket: net.Socket) {
    Reflect.set(socket, kRealConnect, socket.connect.bind(socket))

    socket.connect = function mockConnect(...args) {
      Reflect.set(this, 'connecting', true)

      process.nextTick(() => {
        Reflect.set(this, 'connecting', false)
        this.emit('connect')
      })

      Reflect.set(socket, kConnectArgs, args)
      return this
    }
  }

  public passthrough(): net.Socket {
    const connect = Reflect.get(this.socket, kRealConnect)
    const connectArgs = Reflect.get(this.socket, kConnectArgs)
    connect(connectArgs)
  }

  public errorWith(reason?: Error): void {
    this.socket.destroy(reason)
  }
}
