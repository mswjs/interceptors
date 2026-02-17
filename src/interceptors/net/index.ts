import net from 'node:net'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import { MockSocket } from './mock-socket'
import {
  kServerSocket,
  kSocketProxy,
  SocketController,
} from './socket-controller'

interface SocketEventMap {
  connection: [
    {
      socket: net.Socket
      connectionOptions: NetworkConnectionOptions
      controller: SocketController
    },
  ]
}

export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static symbol = Symbol('socket-interceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const originalNetConnect = net.connect

    net.connect = (...args: [any, any]) => {
      const [connectionOptions, connectionCallback] =
        normalizeNetConnectArgs(args)

      const socket = new MockSocket(connectionOptions, connectionCallback)
      const controller = new SocketController({
        socket,
        createConnection() {
          return originalNetConnect.apply(null, args)
        },
      })

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: controller[kServerSocket],
          connectionOptions,
          controller,
        })
      })

      // Return the socket wrapped in the recorder proxy.
      return controller[kSocketProxy]
    }
    net.createConnection = net.connect

    this.subscriptions.push(() => {
      net.connect = originalNetConnect
    })
  }
}
