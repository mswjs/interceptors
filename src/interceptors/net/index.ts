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

/**
 * Apply a transparent proxy to the "node:net" module on the module's scope.
 * This way, this interceptor can function if it gets imported before the surface
 * that relies on "node:net", like "node:http" or "undici".
 *
 * @note You MUST import the interceptor BEFORE the surface relying on "node:net".
 */
const { createConnection } = net
Object.defineProperties(net.createConnection, {
  [kRestoreValue]: {
    value: createConnection.bind(createConnection),
    enumerable: true,
  },
  [kImplementation]: {
    value() {
      return Reflect.get(net.createConnection, kRestoreValue)
    },
    enumerable: true,
    writable: true,
  },
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
net.createConnection = createSwitchableProxy(net.createConnection)

export class SocketInterceptor extends Interceptor<SocketConnectionEventMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const originalConnect = Reflect.get(net.connect, kRestoreValue)
    const originalCreateConnection = Reflect.get(
      net.createConnection,
      kRestoreValue
    )

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

      this.emitter.emit('connection', {
        options,
        socket,
      })

      return socket
    })

    Reflect.set(
      net.createConnection,
      kImplementation,
      (...args: Array<unknown>) => {
        const [options] = normalizeNetConnectArgs(args as NetConnectArgs)
        const socket = new MockSocket({
          ...args,
          createConnection() {
            return originalCreateConnection.apply(
              originalCreateConnection,
              args as any
            )
          },
        })

        this.emitter.emit('connection', {
          options,
          socket,
        })

        return socket
      }
    )

    this.subscriptions.push(() => {
      Reflect.set(net.connect, kImplementation, originalConnect)
      Reflect.set(
        net.createConnection,
        kImplementation,
        originalCreateConnection
      )
    })
  }
}
