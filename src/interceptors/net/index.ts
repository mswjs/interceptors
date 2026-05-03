import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import { TcpSocketController, TlsSocketController } from './socket-controller'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'
import { createLogger } from '../../utils/logger'
import { patchesRegistry } from '../../utils/patchesRegistry'
import { Interceptor } from '#/src/interceptor'

interface SocketConnectionEventData {
  socket: net.Socket | tls.TLSSocket
  connectionOptions: NetworkConnectionOptions
  controller: TcpSocketController | TlsSocketController
}

class SocketConnectionEvent<
  DataType extends SocketConnectionEventData = SocketConnectionEventData,
> extends TypedEvent<DataType, void, 'connection'> {
  public socket: net.Socket | tls.TLSSocket
  public connectionOptions: NetworkConnectionOptions
  public controller: TcpSocketController | TlsSocketController

  constructor(data: DataType) {
    super(...(['connection', {}] as any))

    this.socket = data.socket
    this.connectionOptions = data.connectionOptions
    this.controller = data.controller
  }
}

type SocketEventMap = {
  connection: SocketConnectionEvent
}

const log = createLogger('SocketInterceptor')

export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static symbol = Symbol.for('socket-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    this.subscriptions.push(
      patchesRegistry.applyPatch(net, 'connect', (realNetConnect) => {
        return (...args: [any, any]) => {
          log('net.connect()', args)

          const [connectionOptions, connectionCallback] =
            normalizeNetConnectArgs(args)

          log({ connectionOptions, connectionCallback })

          const socket = new net.Socket()
          const controller = new TcpSocketController(socket, () => {
            return realNetConnect(...args)
          })

          process.nextTick(() => {
            if (
              !this.emitter.emit(
                new SocketConnectionEvent({
                  socket: controller.serverSocket,
                  controller,
                  connectionOptions,
                })
              )
            ) {
              log(
                'no "connection" listeners found on the interceptor, passthrough...'
              )

              controller.passthrough()
              return
            }

            log('emitted "connection" event!')
          })

          log('connecting the socket...')

          // Patch the lookup option so DNS lookup always succeeds.
          // Passthrough connections are created with the original options and won't be affected.
          connectionOptions.lookup = function mockLookup(
            hostname,
            dnsOptions,
            callback
          ) {
            callback(null, [{ address: '127.0.0.1', family: 4 }])
          }

          return socket.connect(connectionOptions, connectionCallback)
        }
      }),
      patchesRegistry.applyPatch(tls, 'connect', (realTlsConnect) => {
        return (...args: [any, any]) => {
          log('tls.connect()', args)

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
            if (
              !this.emitter.emit(
                new SocketConnectionEvent({
                  socket: controller.serverSocket,
                  controller,
                  connectionOptions: tlsConnectionOptions,
                })
              )
            ) {
              log(
                'no "connection" listeners found on the interceptor, passthrough...'
              )

              controller.passthrough()
              return
            }

            log('emitted the "connection" event!')
          })

          return tlsSocket
        }
      })
    )

    /**
     * @note `net.createConnection()` is an alias for `net.connect()`.
     * But we still have to reassign it to point to the patched `net.connect()`.
     */
    const { createConnection: realNetCreateConnection } = net
    net.createConnection = net.connect

    this.subscriptions.push(() => {
      net.createConnection = realNetCreateConnection
    })
  }
}
