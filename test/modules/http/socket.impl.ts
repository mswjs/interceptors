import net from 'net'
import { Interceptor } from '../../../src'

// net.createConnection()
// Socket.connect()
// lookup
// emitLookup
// socket._handle.connect()
// -> afterComplete
// socket.push(null), socket.read(), socket.emit('connect'), socket.emit('ready')

export interface SocketEventMap {
  connection: () => void
}

export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static interceptorSymbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.interceptorSymbol)
  }

  protected setup(): void {
    console.log('setting up the interceptor...')

    const pureNetCreateConnection = net.createConnection
    this.subscriptions.push(() => {
      net.createConnection = pureNetCreateConnection
    })
  }
}

class MockSocket extends net.Socket {
  private _handle?: SocketHandle

  constructor(options?: net.SocketConstructorOpts) {
    super(options)

    console.log('MockSocket.constructor')

    this.connect({
      port: 80,
      path: '/resource',
      host: 'api.example.com',
    })
  }

  connect(...args: unknown[]): this {
    const [_, callback] = normalizeCreateConnectionArgs(...args)

    /**
     * @note Setting "_handle" is mandatory. Without it,
     * Node considers the socket closed.
     * The handle is set during ".connect()" method.
     */
    this._handle = new SocketHandle()

    if (callback) {
      this.once('connect', callback)
    }

    /**
     * @note Skip the DNS lookup and the actual connection
     * and treat the socket as connected.
     *
     * @todo We should still perform the connection, swallow
     * connection errors, and replay them.
     */
    this.emit('connect')
    this.emit('ready')

    return this
  }

  write(
    chunk: string,
    encoding?: BufferEncoding,
    callback?: (error?: Error) => void
  ) {
    console.log('MockSocket.write', chunk, encoding, callback)

    /**
     * @note Two empty lines at the end of a socket message
     * indicate the end of the message.
     */
    if (chunk.endsWith('\r\n\r\n')) {
      process.nextTick(() => {
        this.push('HTTP/1.1 301 Moved Permanently\r\nConnection:close\r\n')
        this.push('\r\n')
      })
    }

    return super.write(chunk, encoding, callback)
  }
}

function createSocketProxy(socket: net.Socket): net.Socket {
  socket.connect = new Proxy(socket.connect, {
    apply(target, thisArg, args) {
      console.warn('Socket.connect', args)

      // Returns this Socket instance.
      // Also performs the DNS lookup for the supplied host if called directly.
      // Doesn't get called directly when using "net.createConnection()".
      return Reflect.apply(target, thisArg, args)
    },
  })

  socket.write = new Proxy(socket.write, {
    apply(target, thisArg, args) {
      const [chunk, encoding, callback] = args
      console.log('Socket.write', args)
      // return Reflect.apply(target, thisArg, args)
    },
  })

  socket.on('connect', () => {
    console.log('Socket.connect!')
  })

  socket.on('lookup', (error, address, family, host) => {
    console.log('Socket.lookup', { error, address, family, host })
  })

  socket.on('ready', () => {
    socket.push('HTTP/1.1 301 Moved Permanently\r\nConnection:close\r\n\r\n')

    // socket.emit('readable')
    socket.emit('end')
    socket.emit('close')
  })

  socket.on('data', (chunk) => {
    console.log('Socket.data:', chunk.toString('utf8'))
  })

  // 1. resume
  // 2. write (request message)
  // 3. emit lookup
  // 4. emit connect
  // 5. emit ready.
  // 6. emit data (response message)
  // 7. emit readable
  // 8. emit end
  // 9. emit close

  return socket
}

interface TcpWrap {
  address: string
  port: number
  localAddress?: number
  localPort?: number
  oncomplete(
    status: number,
    handle: SocketHandle,
    tcpWrap: TcpWrap,
    readable?: boolean,
    writable?: boolean
  ): number
}

class SocketHandle {
  connect(tcpWrap: TcpWrap, ip: string, port: number) {
    return 0
  }

  connect6() {
    return 0
  }

  readStart() {}

  readStop() {}

  setNoDelay() {}

  writeLatin1String() {
    return 0
  }

  writeUtf8String() {
    return 0
  }

  close() {}

  shutdown() {
    return 0
  }
}

function normalizeCreateConnectionArgs(
  ...args:
    | [options: net.NetConnectOpts, callback?: () => void]
    | [port: number, host?: string, callback?: () => void]
    | [path: string, callback?: () => void]
): [options: net.NetConnectOpts, callback?: () => void] {
  if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string') {
      return [{ port: args[0], host: args[1] }, args[2]]
    }

    return [{ port: args[0] }, args[1]]
  }

  if (typeof args[0] === 'string') {
    return [{ path: args[0] }, args[1]]
  }

  return args
}

net.createConnection = new Proxy(net.createConnection, {
  apply(target, thisArg, args: any[]) {
    const [options] = normalizeCreateConnectionArgs(...args)
    console.log('net.createConnection()', args)

    /**
     * @note You can provide a custom "lookup" function to the
     * network connection that the Socket will use to resolve
     * the given host to an IP address and family.
     * This is how we can suppress DNS lookup for non-existing hosts.
     */
    // args[0].lookup = function (host, dnsOptions, emitLookup) {
    //   console.log('net.lookup:', host, dnsOptions, emitLookup)
    //   // emitLookup(null, '127.0.0.1', 4)
    // }

    return new MockSocket(options)
  },
})
