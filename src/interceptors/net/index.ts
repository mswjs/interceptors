import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import { MockSocket } from './mock-socket'
import { ConnectionController } from './connection-controller'
import { createLogger } from '../../utils/logger'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'

interface SocketEventMap {
  connection: [
    {
      socket: net.Socket
      controller: ConnectionController
      connectionOptions: NetworkConnectionOptions
    },
  ]
}

const log = createLogger('SocketInterceptor')

export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static symbol = Symbol('socket-interceptor')

  constructor() {
    super(SocketInterceptor.symbol)
  }

  protected setup(): void {
    const realNetConnect = net.connect

    /**
     * Luckily, "net.connect()" is rather short and we can replicate it as-is.
     * @see https://github.com/nodejs/node/blob/9cd6630870b776e96c5cf0ac68c31e2f46df3835/lib/net.js#L236
     */
    net.connect = (...args: [any, any]) => {
      const [connectionOptions, connectionCallback] =
        normalizeNetConnectArgs(args)

      log('connect()')
      log({ connectionOptions, connectionCallback })

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

        log('emitted "connection" event!')
      })

      if (connectionOptions.timeout) {
        log('set custom connection timeout:', connectionOptions.timeout)
        clientSocket.setTimeout(connectionOptions.timeout)
      }

      log('connecting the socket...')
      return clientSocket.connect(connectionOptions, connectionCallback)
    }

    const realNetCreateConnection = net.createConnection
    net.createConnection = net.connect

    const realTlsConnect = tls.connect
    tls.connect = (...args: [any, any]) => {
      const [tlsConnectionOptions, secureConnectionCallback] =
        normalizeTlsConnectArgs(args)

      const clientSocket = new MockSocket(tlsConnectionOptions)
      const serverSocket = clientSocket.createServerSocket()
      const controller = new ConnectionController(
        clientSocket,
        function createTlsConnection() {
          return realTlsConnect(...args)
        }
      )

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: serverSocket,
          controller,
          connectionOptions: tlsConnectionOptions,
        })
      })

      if (tlsConnectionOptions.socket) {
        throw new Error('Custom sockets in TLS connections are not supported')
      }

      return clientSocket.connect(
        tlsConnectionOptions,
        secureConnectionCallback
      )
    }

    this.subscriptions.push(() => {
      net.connect = realNetConnect
      net.createConnection = realNetCreateConnection

      tls.connect = realTlsConnect
    })
  }
}
