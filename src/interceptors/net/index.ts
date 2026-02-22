import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import {
  SocketController,
  TcpSocketController,
  TlsSocketController,
} from './mock-socket'
import { createLogger } from '../../utils/logger'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'

interface SocketEventMap {
  connection: [
    {
      socket: net.Socket | tls.TLSSocket
      controller: SocketController
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

    net.connect = (...args: [any, any]) => {
      const [connectionOptions, connectionCallback] =
        normalizeNetConnectArgs(args)

      log('net.connect()')
      log({ connectionOptions, connectionCallback })

      const socket = realNetConnect(...args)
      const controller = new TcpSocketController(socket, () => {
        return realNetConnect(...args)
      })

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: controller.serverSocket,
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
      return socket
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

      const controller = new TlsSocketController(tlsSocket, () => {
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
