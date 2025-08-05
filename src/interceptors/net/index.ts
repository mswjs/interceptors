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

export class SocketInterceptor extends Interceptor<SocketConnectionEventMap> {
  static symbol = Symbol('SocketInterceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const {
      connect: originalConnect,
      createConnection: originalCreateConnection,
    } = net

    net.connect = (...args: Array<unknown>) => {
      const [options, connectionListener] = normalizeNetConnectArgs(
        args as NetConnectArgs
      )
      const socket = new MockSocket({
        ...args,
        onConnect: connectionListener,
        createConnection() {
          return originalConnect.apply(originalCreateConnection, args as any)
        },
      })

      this.emitter.emit('connection', {
        options,
        socket,
      })

      return socket
    }

    net.createConnection = (...args: Array<unknown>) => {
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

    this.subscriptions.push(() => {
      net.connect = originalConnect
      net.createConnection = originalCreateConnection
    })
  }
}
