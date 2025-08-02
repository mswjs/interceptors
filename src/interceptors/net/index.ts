import net from 'node:net'
import { Interceptor } from '../../Interceptor'
import { MockSocket } from './mock-socket'
import {
  NetConnectArgs,
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'

export interface SocketConnectionEventMap {
  /**
   * Outgoing socket connection.
   */
  socket: [
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
      connect: originalNetConnect,
      createConnection: originalCreateConnection,
    } = net

    net.createConnection = (...args: Array<unknown>) => {
      const [options, connectionListener] = normalizeNetConnectArgs(
        args as NetConnectArgs
      )
      const socket = new MockSocket()

      this.emitter.emit('socket', {
        options,
        socket,
      })

      return socket
    }

    this.subscriptions.push(() => {
      net.connect = originalNetConnect
      net.createConnection = originalCreateConnection
    })
  }
}
