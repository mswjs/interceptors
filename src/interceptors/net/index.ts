import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import { TypedEvent } from 'rettime'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import {
  kPatched,
  TcpSocketController,
  TlsSocketController,
} from './socket-controller'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'
import { createLogger } from '../../utils/logger'
import { patchesRegistry } from '../../utils/patchesRegistry'
import { Interceptor } from '#/src/interceptor'

declare module 'node:http' {
  interface Agent {
    /**
     * @note An undocumented method backing every agent-driven request
     * (see "#stopReusingUnpatchedSockets").
     */
    addRequest?: (
      request: http.ClientRequest,
      ...args: Array<unknown>
    ) => void
  }
}

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

const logger = createLogger('socket')

/**
 * A DNS lookup function for intercepted sockets. It always succeeds,
 * resolving any hostname to the loopback address. This ensures the
 * "lookup"/"connectionAttempt" socket events fire even for non-existent
 * hosts, and no real DNS resolution is performed. Passthrough
 * connections are created with the original options and use the real
 * (or the caller's custom) lookup instead.
 */
const mockLookup: net.LookupFunction = (hostname, dnsOptions, callback) => {
  const family = dnsOptions.family === 6 ? 6 : 4
  const address = family === 6 ? '::1' : '127.0.0.1'

  /**
   * @note Call back asynchronously since DNS lookup is always
   * asynchronous in Node.js. Calling back synchronously emits
   * the "lookup"/"connectionAttempt" socket events before the
   * consumer gets a chance to add listeners for them.
   */
  process.nextTick(() => {
    /**
     * @note Honor the Node.js lookup contract: the callback receives
     * an array of addresses only when the "all" option is set
     * (e.g. during the family autoselection). Otherwise, it receives
     * a single address and its family. Node.js rejects an array in
     * the latter case with "ERR_INVALID_IP_ADDRESS".
     */
    if (dnsOptions.all) {
      callback(null, [{ address, family }])
      return
    }

    callback(null, address, family)
  })
}

/**
 * Interceptor for `net.Socket` connections.
 */
export class SocketInterceptor extends Interceptor<SocketEventMap> {
  static symbol = Symbol.for('socket-interceptor')

  protected predicate(): boolean {
    return true
  }

  protected setup(): void {
    this.subscriptions.push(
      patchesRegistry.applyPatch(net, 'connect', (realNetConnect) => {
        return (...args: [any, any]) => {
          logger.verbose('net.connect() %o', args)

          const [connectionOptions, connectionCallback] =
            normalizeNetConnectArgs(args)

          logger.verbose('connection options %o', {
            connectionOptions,
            connectionCallback,
          })

          /**
           * @note Create passthrough connections without the connection
           * callback. The callback is already registered as a "connect"
           * listener on the socket returned to the consumer. Passing it
           * to the passthrough connection would invoke it twice.
           */
          const passthroughArgs = args.filter((arg) => {
            return typeof arg !== 'function'
          }) as typeof args

          /**
           * @note Create the socket with the original options, the same
           * way `net.connect()` does. This preserves the consumer-facing
           * socket behaviors (e.g. "allowHalfOpen").
           */
          const socketOptions =
            args[0] !== null &&
            typeof args[0] === 'object' &&
            !('href' in args[0])
              ? args[0]
              : {}

          const socket = new net.Socket(socketOptions)
          const controller = new TcpSocketController(socket, () => {
            return realNetConnect(...passthroughArgs)
          })

          process.nextTick(() => {
            if (socket.destroyed) {
              return
            }

            if (
              !this.emitter.emit(
                new SocketConnectionEvent({
                  socket: controller.serverSocket,
                  controller,
                  connectionOptions,
                })
              )
            ) {
              logger.verbose(
                'no "connection" listeners found on the interceptor, passthrough...'
              )

              controller.passthrough()
              return
            }

            logger.verbose('emitted "connection" event!')
          })

          logger.verbose('connecting the socket...')

          /**
           * @note The requested local address/port are stripped from the
           * actual "socket.connect()" call by the controller to prevent
           * binding the intercepted socket (see the "connect" proxy).
           */
          const mockConnectionOptions = {
            ...connectionOptions,
          }

          // Patch the lookup option so DNS lookup always succeeds.
          mockConnectionOptions.lookup = mockLookup

          try {
            /**
             * @note The normalized options are looser than the declared
             * "SocketConnectOpts" (e.g. the port may be a string when a
             * URL is passed). Node.js validates them at runtime.
             */
            return socket.connect(
              mockConnectionOptions as net.SocketConnectOpts,
              connectionCallback ?? undefined
            )
          } catch (error) {
            /**
             * @note "socket.connect()" can throw synchronously on invalid
             * input (e.g. a bad port). Destroy the socket so the pending
             * interception tick does not act on it, then let the error
             * propagate to the consumer like in Node.js.
             */
            socket.destroy()
            throw error
          }
        }
      }),
      patchesRegistry.applyPatch(tls, 'connect', (realTlsConnect) => {
        return (...args: [any, any]) => {
          logger.verbose('tls.connect() %o', args)

          const [tlsConnectionOptions, secureConnectionCallback] =
            normalizeTlsConnectArgs(args)

          const realCheckServerIdentity =
            tlsConnectionOptions.checkServerIdentity ?? tls.checkServerIdentity

          const tlsSocket = realTlsConnect(
            {
              ...tlsConnectionOptions,
              /**
               * @note Mock the DNS lookup, the same way "net.connect()"
               * interception does. The socket emits the "lookup" and
               * "connectionAttempt" events even for non-existent hosts,
               * and no real DNS resolution is performed.
               */
              lookup: mockLookup,
              /**
               * @note Skip the server identity check for mocked connections.
               * There is no real peer certificate to verify, and failing
               * the check would destroy the socket. Passthrough connections
               * delegate to the caller's identity check (or the default one).
               */
              checkServerIdentity(hostname, certificate) {
                if (controller.readyState === TlsSocketController.CLAIMED) {
                  return undefined
                }

                return realCheckServerIdentity(hostname, certificate)
              },
            },
            secureConnectionCallback
          )

          /**
           * @note Create passthrough connections without the secure
           * connection callback. The callback is already registered on
           * the TLS socket returned to the consumer. Passing it to the
           * passthrough connection would invoke it twice.
           */
          const passthroughArgs = args.filter((arg) => {
            return typeof arg !== 'function'
          }) as typeof args

          const controller = new TlsSocketController(
            tlsSocket,
            () => {
              return realTlsConnect(...passthroughArgs)
            },
            tlsConnectionOptions
          )

          process.nextTick(() => {
            if (tlsSocket.destroyed) {
              return
            }

            if (
              !this.emitter.emit(
                new SocketConnectionEvent({
                  socket: controller.serverSocket,
                  controller,
                  connectionOptions: tlsConnectionOptions,
                })
              )
            ) {
              logger.verbose(
                'no "connection" listeners found on the interceptor, passthrough...'
              )

              controller.passthrough()
              return
            }

            logger.verbose('emitted the "connection" event!')
          })

          return tlsSocket
        }
      }),
      this.#stopReusingUnpatchedSockets()
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

  /**
   * Prevent the `net.Socket` instances created before this interceptor
   * was applied from getting reused by an `Agent`. Purging them from the
   * keep-alive pool forces the agent to establish new (intercepted)
   * connections instead.
   */
  #stopReusingUnpatchedSockets(): () => void {
    /**
     * @note "Agent.prototype.addRequest" is undocumented but stable:
     * its signature changed once (the keep-alive Agent rewrite in
     * Node.js 0.12), and the ecosystem (agent-base, agentkeepalive,
     * APM wrappers) has relied on it ever since. "https.Agent"
     * inherits it, so a single patch covers both.
     */
    if (typeof http.Agent.prototype.addRequest !== 'function') {
      return () => {}
    }

    return patchesRegistry.applyPatch(
      http.Agent.prototype,
      'addRequest',
      (realAddRequest) => {
        return function (this: http.Agent, ...args) {
          /**
           * @note Destroy the free sockets created before the interceptor
           * was applied. Destroying flips their "destroyed" state
           * synchronously, so the original "addRequest" below discards
           * them and dials a new (intercepted) connection instead.
           * The "freeSockets" pool only contains idle sockets by
           * definition, so destroying them aborts nothing in-flight.
           */
          for (const sockets of Object.values(this.freeSockets)) {
            if (sockets == null) {
              continue
            }

            for (const socket of sockets) {
              if (!socket[kPatched]) {
                socket.destroy()
              }
            }
          }

          return realAddRequest?.apply(this, args)
        }
      }
    )
  }
}
