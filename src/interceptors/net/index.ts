import net from 'node:net'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import {
  kServerSocket,
  kSocketProxy,
  SocketController,
} from './socket-controller'
import { NewMockSocket } from './mocker-socket'
import { ConnectionController } from './connection-controller'

interface SocketEventMap {
  connection: [
    {
      socket: net.Socket
      controller: ConnectionController
      connectionOptions: NetworkConnectionOptions
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

      const createConnection = () => {
        return realNetConnect(...args)
      }

      const clientSocket = new NewMockSocket(connectionOptions)
      const serverSocket = clientSocket.createServerSocket()
      const controller = new ConnectionController(
        clientSocket,
        createConnection
      )

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: serverSocket,
          controller,
          connectionOptions,
        })
      })

      if (connectionOptions.timeout) {
        clientSocket.setTimeout(connectionOptions.timeout)
      }

      return clientSocket.connect(connectionOptions, connectionCallback)
    }

    const realNetCreateConnection = net.createConnection
    net.createConnection = net.connect

    this.subscriptions.push(() => {
      net.connect = realNetConnect
      net.createConnection = realNetCreateConnection
    })
  }
}
