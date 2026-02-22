import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import {
  MockSocket,
  MockTlsSocketController,
  toServerSocket,
} from './mock-socket'
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

      log('net.connect()')
      log({ connectionOptions, connectionCallback })

      const socket = new MockSocket(connectionOptions)
      const controller = new ConnectionController(
        socket,
        function createConnection() {
          return realNetConnect(...args)
        }
      )

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: toServerSocket(socket),
          controller,
          connectionOptions,
        })

        log('emitted "connection" event!')
      })

      if (connectionOptions.timeout) {
        log('set custom connection timeout:', connectionOptions.timeout)
        socket.setTimeout(connectionOptions.timeout)
      }

      log('connecting the socket...')
      return socket.connect(connectionOptions, connectionCallback)
    }

    const realNetCreateConnection = net.createConnection
    net.createConnection = net.connect

    /**
     * TLS.
     */

    const realTlsConnect = tls.connect
    tls.connect = (...args: [any, any]) => {
      const [tlsConnectionOptions, secureConnectionCallback] =
        normalizeTlsConnectArgs(args)

      tlsConnectionOptions.rejectUnauthorized = false

      const tlsSocket = realTlsConnect(
        {
          ...tlsConnectionOptions,
          /**
           * Suppress unauthorized connection errors to allow mocking connections to non-existing hosts.
           * This prevents the "Error: Hostname/IP does not match certificate's altnames: Cert does not contain a DNS name" error.
           * @note Passthrough scenarios will respect the original "rejectUnauthorized" option.
           */
          rejectUnauthorized: false,
        },
        secureConnectionCallback
      )

      const controller = new MockTlsSocketController(tlsSocket, () => {
        return realTlsConnect(...args)
      })

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: controller.serverSocket,
          controller,
          connectionOptions: tlsConnectionOptions,
        })
      })

      return tlsSocket
    }

    this.subscriptions.push(() => {
      net.connect = realNetConnect
      net.createConnection = realNetCreateConnection

      tls.connect = realTlsConnect
    })
  }
}
