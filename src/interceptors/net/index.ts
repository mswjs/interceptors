import net from 'node:net'
import { Interceptor } from '../../Interceptor'
import { MockSocket } from './mock-socket'
import {
  NetConnectArgs,
  normalizeNetConnectArgs,
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
const kRestoreValue = Symbol('kRestoreValue')

if (Reflect.get(net.connect, kImplementation) == null) {
  /**
   * Apply a transparent proxy to the "node:net" module on the module's scope.
   * This way, this interceptor can function if it gets imported before the surface
   * that relies on "node:net", like "node:http" or "undici".
   *
   * @note You MUST import the interceptor BEFORE the surface relying on "node:net".
   */
  const { connect } = net

  Reflect.set(net.connect, kRestoreValue, connect.bind(connect))
  Reflect.set(net.connect, kImplementation, () => {
    return Reflect.get(net.connect, kRestoreValue)
  })

  function createSwitchableProxy(target: any) {
    return new Proxy(target, {
      apply(target, thisArg, argArray) {
        return Reflect.apply(
          Reflect.get(target, kImplementation),
          thisArg,
          argArray
        )
      },
    })
  }

  net.connect = createSwitchableProxy(net.connect)
  /**
   * `net.createConnection` is an alias for `net.connect`.
   * @see https://github.com/nodejs/node/blob/9bcc5a8f01acf9583b45b3bbddf8f043a001bb3c/lib/net.js#L2489
   */
  net.createConnection = net.connect
}

export class SocketInterceptor extends Interceptor<SocketConnectionEventMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const originalConnect = Reflect.get(net.connect, kRestoreValue)

    Reflect.set(net.connect, kImplementation, (...args: Array<unknown>) => {
      const [options, connectionListener] = normalizeNetConnectArgs(
        args as NetConnectArgs
      )
      const socket = new MockSocket({
        ...args,
        onConnect: connectionListener,
        createConnection() {
          return originalConnect.apply(originalConnect, args as any)
        },
      })
      socket.connect()

      this.emitter.emit('connection', {
        options,
        socket,
      })

      return socket
    })

    this.subscriptions.push(() => {
      Reflect.set(net.connect, kImplementation, originalConnect)
    })
  }
}
