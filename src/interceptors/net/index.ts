import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import { MockSocket } from './mock-socket'
import {
  normalizeNetConnectArgs,
  type NetConnectArgs,
  type NetworkConnectionOptions,
} from './utils/normalize-net-connect-args'

export interface SocketConnectionEventMap {
  connection: [
    args: {
      socket: MockSocket
      options: NetworkConnectionOptions
    }
  ]
}

const kImplementation = Symbol('kImplementation')
const kOriginalValue = Symbol('kOriginalValue')

function createSwitchableProxy(target: any) {
  return new Proxy(target, {
    apply(target, thisArg, argArray) {
      return Reflect.get(target, kImplementation).apply(thisArg, argArray)
    },
  })
}

if (Reflect.get(net.connect, kImplementation) == null) {
  /**
   * Apply a transparent proxy to the "node:net" module on the module's scope.
   * This way, this interceptor can function if it gets imported before the surface
   * that relies on "node:net", like "node:http" or "undici".
   *
   * @note You MUST import the interceptor BEFORE the surface relying on "node:net".
   */
  const { connect: originalConnect } = net

  Object.defineProperties(net.connect, {
    [kOriginalValue]: {
      value: originalConnect,
    },
    [kImplementation]: {
      writable: true,
      value() {
        return Reflect.get(net.connect, kOriginalValue)
      },
    },
  })

  net.connect = createSwitchableProxy(net.connect)
  /**
   * `net.createConnection` is an alias for `net.connect`.
   * @see https://github.com/nodejs/node/blob/9bcc5a8f01acf9583b45b3bbddf8f043a001bb3c/lib/net.js#L2489
   */
  net.createConnection = net.connect
}

if (Reflect.get(tls.connect, kImplementation) == null) {
  const { connect: originalConnect } = tls

  Object.defineProperties(tls.connect, {
    [kOriginalValue]: {
      value: originalConnect,
    },
    [kImplementation]: {
      writable: true,
      value() {
        return Reflect.get(tls.connect, kOriginalValue)
      },
    },
  })

  tls.connect = createSwitchableProxy(tls.connect)
}

export class SocketInterceptor extends Interceptor<SocketConnectionEventMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const originalNetConnect = Reflect.get(net.connect, kOriginalValue)
    this.subscriptions.push(() => {
      Reflect.set(net.connect, kImplementation, originalNetConnect)
    })

    Reflect.set(net.connect, kImplementation, (...args: Array<unknown>) => {
      const [options, connectionCallback] = normalizeNetConnectArgs(
        args as NetConnectArgs
      )

      const socket = new MockSocket({
        ...args,
        connectionCallback,
        createConnection() {
          return originalNetConnect(...args)
        },
      })

      /**
       * @note Do NOT call `socket.connect()` here.
       * Instead, keep the socket connection pending and delegate the actual
       * connect to the user. Calling `.connect()` on a mock socket is handy
       * for simulating a successful connection. Calling `.passthrough()` will
       * tap into the unpatched `net.connect()`, which will call `socket.connect()`.
       */

      process.nextTick(() => {
        this.emitter.emit('connection', {
          options,
          socket,
        })
      })

      return socket
    })

    const originalTlsConnect = Reflect.get(tls.connect, kOriginalValue)
    this.subscriptions.push(() => {
      Reflect.set(tls.connect, kImplementation, originalTlsConnect)
    })

    Reflect.set(tls.connect, kImplementation, (...args: Array<unknown>) => {
      const [options, connectionCallback] = normalizeNetConnectArgs(
        args as NetConnectArgs
      )

      const socket = new MockSocket({
        ...args,
        connectionCallback,
        createConnection() {
          return originalTlsConnect(...args)
        },
      })

      process.nextTick(() => {
        this.emitter.emit('connection', {
          options,
          socket,
        })
      })

      return socket
    })
  }
}
