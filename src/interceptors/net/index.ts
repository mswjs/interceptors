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
import { NewMockSocket } from './mocker-socket'

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
    const realNetConnect = net.connect

    /**
     * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L236
     */
    net.connect = (...args: [any, any]) => {
      const [connectionOptions, connectionCallback] =
        normalizeNetConnectArgs(args)

      // const socket = new MockSocket(connectionOptions, connectionCallback)
      // const controller = new SocketController({
      //   socket,
      //   createConnection() {
      //     return realNetConnect.apply(null, args)
      //   },
      // })

      const socket = new NewMockSocket(args)

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket,
          // socket: controller[kServerSocket],
          connectionOptions,
          // controller,
        })
      })

      if (connectionOptions.timeout) {
        socket.setTimeout(connectionOptions.timeout)
      }

      return socket.connect(connectionOptions, connectionCallback)

      // Return the socket wrapped in the recorder proxy.
      // return controller[kSocketProxy]
    }

    const realNetCreateConnection = net.createConnection
    net.createConnection = net.connect

    this.subscriptions.push(() => {
      net.connect = realNetConnect
      net.createConnection = realNetCreateConnection
    })
  }
}
