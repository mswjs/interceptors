import net from 'node:net'
import http, { IncomingMessage } from 'node:http'
import { Interceptor } from '../..'
import EventEmitter from 'node:events'
import { Readable } from 'stream'

export type SocketEventsMap = {
  socket: [SocketEvent]
}

export class SocketInterceptor extends Interceptor<SocketEventsMap> {
  static interceptorSymbol = Symbol('socket')

  constructor() {
    super(SocketInterceptor.interceptorSymbol)
  }

  protected setup(): void {
    /**
     * "new net.Socket()".
     */
    const socketProxy = Proxy.revocable(net.Socket, {
      construct: (target, args, newTarget) => {
        const socket = new SocketController(args[0])
        this.emitter.emit('socket', new SocketEvent(socket))
        return socket
      },
    })
    net.Socket = socketProxy.proxy
    this.subscriptions.push(() => {
      socketProxy.revoke()
    })

    /**
     * "net.createConnection()".
     */
    const netCreateConnectionProxy = Proxy.revocable(net.createConnection, {
      apply: (target, thisArg, args) => {
        console.log('net.createConnection()', args)
        const socket = new SocketController(args[0])

        const event = new SocketEvent(socket)
        this.emitter.emit('socket', event)

        return socket
      },
    })
    net.createConnection = netCreateConnectionProxy.proxy
    this.subscriptions.push(() => netCreateConnectionProxy.revoke())

    /**
     * "http.*()".
     */
    const httpGetProxy = Proxy.revocable(http.get, {
      apply: (target, context, args) => {
        const clientRequest = new ClientRequestController(args)

        clientRequest.once('socket', (socket) => {
          const event = new SocketEvent(socket)
          this.emitter.emit('socket', event)

          event.on('data', () => {
            // @ts-ignore
            clientRequest.res = new IncomingMessage(socket)
          })
        })

        return clientRequest
      },
    })
    http.get = httpGetProxy.proxy
    this.subscriptions.push(() => httpGetProxy.revoke())
  }
}

/**
 * ClientRequest.
 */
class ClientRequestController extends http.ClientRequest {
  // private response: http.IncomingMessage
  // private socketEvent: SocketEvent = null as any

  constructor(...args: [any]) {
    super(...args)

    // Reflect.set(this, 'socket', new SocketController())

    // this.on('socket', (socket) => {
    //   this.socketEvent = new SocketEvent(socket)
    // })

    // this.response = new http.IncomingMessage(this.socket!)

    this.once('socket', (socket) => {
      let [socketOnData] = socket.listeners('data')

      socket['_events'].data = new Proxy(socketOnData, {
        apply(target, context, args) {
          console.log('----- socketOnData!', args[0].toString('utf8'))
          return Reflect.apply(target, context, args)
        },
      })
    })
  }

  emit(event: 'close'): boolean
  emit(event: 'drain'): boolean
  emit(event: 'error', err: Error): boolean
  emit(event: 'finish'): boolean
  emit(event: 'pipe', src: Readable): boolean
  emit(event: 'unpipe', src: Readable): boolean
  emit(event: string | symbol, ...args: any[]): boolean
  emit(...args: [any]): boolean {
    console.log('request emit', args)

    if (args[0] === 'error') {
      console.log('haderror?', this.socket._hadError)
      Reflect.set(this.socket, '_hadError', false)
    }

    if (args[0] === 'error') {
      return false
    }

    return super.emit(...args)
  }
}

/**
 * Socket.
 */

const DEFAULT_CONNECTION_IP = '127.0.0.1'
const DEFAULT_CONNECTION_HOST = 'localhost'
const DEFAULT_CONNECTION_PORT = 80
const DEFAULT_CONNECTION_PATH = '/'
const DEFAULT_ADDRESS_FAMILY = 6

class SocketEvent extends EventEmitter {
  constructor(protected readonly socket: net.Socket) {
    super()

    this.socket._hadError = new Proxy(this.socket._hadError, {
      set(target, property, nextValue) {
        throw new Error('had err')
        return false
      },
    })

    this.socket.emit = new Proxy(this.socket.emit, {
      apply: (target, context, args) => {
        console.log('socket.emit', args)

        if (args[0] === 'error' || args[0] === 'close') {
          return false
        }

        if (args[0] === 'data') {
          console.log('socket emit data:', args[1].toString('utf8'))
        }

        return Reflect.apply(target, context, args)
      },
    })

    this.socket._destroy = (error, callback) => {
      console.log('socket destroy?', error)
      callback(null)
    }

    this.socket._write = (chunk, encoding, callback) => {
      this.emit('data', chunk, encoding)
      callback()
    }

    this.socket.pause()
  }

  public connect(connectionOptions?: {
    host?: string
    family?: string | number
    ipAddress?: string
  }): void {
    const ip = connectionOptions?.ipAddress || DEFAULT_CONNECTION_IP
    const family = connectionOptions?.family
    const host = connectionOptions?.host || this.socket['_host']

    console.log('SocketEvent.connect()')

    process.nextTick(() => {
      console.log('SocketEvent: emitting lookup...')
      this.socket.emit('lookup', null, ip, family, host)
      console.log('SocketEvent: emitting connect...')
      this.socket.emit('connect')
      console.log('SocketEvent: emitting ready...')
      this.socket.emit('ready')

      this.socket.resume()
    })
  }

  /**
   * Listen to the outgoing socket chunks (e.g. request data).
   */
  public on(
    event: 'data',
    callback: (chunk: Buffer, encoding?: BufferEncoding) => void
  ) {
    return super.on(event, callback)
  }

  /**
   * Write chunks to the socket from the server's perspective.
   */
  public push(chunk?: Buffer | string | null, encoding?: BufferEncoding): void {
    this.socket.push(chunk, encoding)
  }
}

class SocketController extends net.Socket {
  private _connection: {
    host: string
    port: number
    path: string
    family: number | string
  }

  constructor(protected readonly options?: net.SocketConstructorOpts) {
    super(options)

    this._connection = {
      /**
       * @note Although type-wise the "Socket" constructor cannot accept the
       * connection options, this isn't what happens on runtime. For example,
       * when called "net.createConnection()", the "net" module passes the
       * connection options directly on to the new "Socket" instance.
       */
      host: Reflect.get(this.options || {}, 'host') || DEFAULT_CONNECTION_HOST,
      port: Reflect.get(this.options || {}, 'port') || DEFAULT_CONNECTION_PORT,
      path: Reflect.get(this.options || {}, 'path') || DEFAULT_CONNECTION_PATH,
      family:
        Reflect.get(this.options || {}, 'family') || DEFAULT_ADDRESS_FAMILY,
    }
  }

  connect(
    options: net.SocketConnectOpts,
    connectionListener?: (() => void) | undefined
  ): this
  connect(
    port: number,
    host: string,
    connectionListener?: (() => void) | undefined
  ): this
  connect(port: number, connectionListener?: (() => void) | undefined): this
  connect(path: string, connectionListener?: (() => void) | undefined): this
  connect(...args: Array<unknown>): this {
    if (typeof args[0] === 'number') {
      this._connection.port = args[0]

      if (typeof args[1] === 'string') {
        this._connection.host = args[1]
      }

      return this
    }

    if (typeof args[0] === 'string') {
      this._connection.path = args[0]
      return this
    }

    if (typeof args[0] === 'object' && args[0] != null) {
      if ('path' in args[0] && typeof args[0].path === 'string') {
        this._connection.path = args[0].path
      }

      if ('host' in args[0] && typeof args[0].host === 'string') {
        this._connection.host = args[0].host
      }

      if ('port' in args[0] && typeof args[0].port === 'number') {
        this._connection.port = args[0].port
      }

      if (
        'family' in args[0] &&
        (typeof args[0].family == 'number' ||
          typeof args[0].family === 'string')
      ) {
        this._connection.family = args[0].family
      }
    }

    return this
  }

  public triggerConnect(connectionOptions?: {
    host?: string
    family?: number | string
  }) {
    const host = connectionOptions?.host || this.connection.host
    const family = connectionOptions?.family || this.connection.family

    process.nextTick(() => {
      this.emit('lookup', null, '127.0.0.1', family, host)
      this.emit('connect')
      this.emit('ready')
    })

    return this
  }
}

function getProperty<T extends object>(
  target: T | undefined,
  key: keyof T
): T[typeof key] | undefined {
  return Reflect.get(target || {}, key)
}
