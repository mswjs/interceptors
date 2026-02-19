import net from 'node:net'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import { MockSocket } from './mock-socket'
import { ConnectionController } from './connection-controller'
import { logger } from '../../utils/logger'

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

    const log = logger.child({ module: 'net.connect' })

    /**
     * Luckily, "net.connect()" is rather short and we can replicate it as-is.
     * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L236
     */
    net.connect = (...args: [any, any]) => {
      const [connectionOptions, connectionCallback] =
        normalizeNetConnectArgs(args)

      log.debug('connect()')
      log.debug({ connectionOptions, connectionCallback })

      const clientSocket = new MockSocket(connectionOptions)
      const serverSocket = clientSocket.createServerSocket()
      const controller = new ConnectionController(
        clientSocket,
        function createConnection() {
          return realNetConnect(...args)
        }
      )

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: serverSocket,
          controller,
          connectionOptions,
        })

        log.debug('emitted "connection" event!')
      })

      if (connectionOptions.timeout) {
        log.debug('set custom connection timeout:', connectionOptions.timeout)
        clientSocket.setTimeout(connectionOptions.timeout)
      }

      log.debug('connecting the socket...')
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
