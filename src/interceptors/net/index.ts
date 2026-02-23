import net from 'node:net'
import tls from 'node:tls'
import { Interceptor } from '../../Interceptor'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import { TcpSocketController, TlsSocketController } from './mock-socket'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'
import { createLogger } from '../../utils/logger'

interface SocketEventMap {
  connection: [
    {
      socket: net.Socket | tls.TLSSocket
      controller: TcpSocketController | TlsSocketController
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

      const socket = new net.Socket()
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

      const tlsSocket = realTlsConnect(
        {
          ...tlsConnectionOptions,
          /**
           * Use a fake IP address to bypass DNS lookup.
           * This ensures that "connectionAttempt" event fires even for non-existent hosts.
           * Node.js skips DNS resolution when the host is an IP address, going directly to
           * "internalConnect()" which emits "connectionAttempt".
           * @see https://github.com/nodejs/node/blob/5babc8d5c91914ce0fb708e647c144570c671c50/lib/net.js
           *
           * @todo This will produce invalid "lookup" event on the socket, failing compliance.
           */
          host: '127.0.0.1',
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
