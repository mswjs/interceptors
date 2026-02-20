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
      const controller = new ConnectionController(
        clientSocket,
        function createConnection() {
          return realNetConnect(...args)
        }
      )

      process.nextTick(() => {
        this.emitter.emit('connection', {
          socket: clientSocket.createServerSocket(),
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
          /**
           * @fixme This is incorrect. The TLSSocket has to be exposed here so the user can access its properties,
           * like "encrypted", "secure", etc. I think I need to create a MockTlsSocket class after all.
           * TLS handling is just DRAMATICALLY different from TCP.
           */
          socket: serverSocket,
          controller,
          connectionOptions: tlsConnectionOptions,
        })
      })

      /**
       * If "socket" is unset, "TLSSocket" will rely on "net.Socket.connect" to create one.
       * This will cause the unpatched socket to be created, failing connections to non-existing hosts.
       * @see https://github.com/nodejs/node/blob/bdc8131fa78089b81b74dbff467365afb6536e6a/lib/internal/tls/wrap.js#L560
       */
      tlsConnectionOptions.socket = clientSocket

      /**
       * @note Enable unauthorized requests by default, unless explicitly disabled.
       * It's either this or asking the user to always provide a custom Agent that
       * allows otherwise unauthorized requests (e.g. self-signed SSL, non-existing hosts).
       *
       * @todo @fixme Reconsider this.
       */
      tlsConnectionOptions.rejectUnauthorized ??= false

      const tlsSocket = realTlsConnect(
        tlsConnectionOptions,
        secureConnectionCallback
      )
      clientSocket.wrapTlsSocket(tlsSocket)

      return tlsSocket
    }

    this.subscriptions.push(() => {
      net.connect = realNetConnect
      net.createConnection = realNetCreateConnection

      tls.connect = realTlsConnect
    })
  }
}
