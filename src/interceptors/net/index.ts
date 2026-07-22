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
import { getTlsConnectOptions } from './utils/get-tls-connect-options'
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
    const interceptor = this

    /**
     * @note A synchronous re-entrancy latch for creating passthrough
     * TLS connections. The original "tls.connect()" constructs a TLS
     * socket and calls "socket.connect()" on it synchronously, and that
     * call must reach Node.js as-is instead of being intercepted again.
     */
    let isCreatingPassthroughConnection = false

    this.subscriptions.push(
      /**
       * @note Intercept connections at the "net.Socket.prototype.connect"
       * level instead of patching the "net.connect()" module function.
       * ESM consumers snapshot the module bindings at import time
       * ("import * as net from 'node:net'"), so reassigning "net.connect"
       * is invisible to them. Every client connection ends up calling
       * "Socket.prototype.connect" (including the one made by the original
       * "net.connect()"), and prototype mutations are visible regardless
       * of how the module was imported.
       */
      patchesRegistry.applyPatch(
        net.Socket.prototype,
        'connect',
        (realSocketConnect) => {
          return function connect(this: net.Socket, ...args: [any, any]) {
            const socket = this

            /**
             * @note Skip the sockets this interceptor already controls
             * (the mock connect call below, re-connects of an intercepted
             * socket, passthrough sockets) and the sockets created while
             * dialing a passthrough TLS connection. Their connects must
             * reach Node.js as-is.
             */
            if (socket[kPatched] || isCreatingPassthroughConnection) {
              return realSocketConnect.apply(socket, args)
            }

            logger.verbose('socket.connect() %o', args)

            /**
             * @note The original "net.connect()"/"tls.connect()" normalize
             * the arguments themselves and call this method with the
             * normalized array instead of the individual arguments.
             */
            const connectArgs = (
              Array.isArray(args[0]) ? args[0] : args
            ) as typeof args

            const [transportConnectionOptions, connectionCallback] =
              normalizeNetConnectArgs(connectArgs)

            logger.verbose('connection options %o', {
              transportConnectionOptions,
              connectionCallback,
            })

            let controller: TcpSocketController
            let connectionOptions: NetworkConnectionOptions

            if (socket instanceof tls.TLSSocket) {
              /**
               * @note TLS sockets arrive here from the original
               * "tls.connect()", which connects the transport of the TLS
               * socket it constructs ("connectionCallback" is its internal
               * "_start" handshake trigger). The original TLS connection
               * options are recovered from the socket instance since the
               * construction has already happened.
               */
              const realTlsConnectionOptions = getTlsConnectOptions(socket)
              const [tlsConnectionOptions] = normalizeTlsConnectArgs([
                {
                  ...transportConnectionOptions,
                  ...realTlsConnectionOptions,
                } as tls.ConnectionOptions,
              ])

              connectionOptions = tlsConnectionOptions
              controller = new TlsSocketController(
                socket,
                () => {
                  /**
                   * @note Create the passthrough connection via the original
                   * "tls.connect()" with the original connection options
                   * (the real DNS lookup and the caller's certificate
                   * validation included). The latch exempts the transport
                   * connect of that connection from interception.
                   */
                  isCreatingPassthroughConnection = true

                  try {
                    return tls.connect(
                      (realTlsConnectionOptions ??
                        tlsConnectionOptions) as tls.ConnectionOptions
                    )
                  } finally {
                    isCreatingPassthroughConnection = false
                  }
                },
                tlsConnectionOptions
              )
            } else {
              /**
               * @note Create passthrough connections without the connection
               * callback. The callback is already registered as a "connect"
               * listener on the consumer's socket. Passing it to the
               * passthrough connection would invoke it twice.
               */
              const passthroughArgs = connectArgs.filter((arg) => {
                return typeof arg !== 'function'
              }) as typeof args

              /**
               * @note Create the passthrough socket with the original
               * options, the same way "net.connect()" does. Connect it via
               * the unpatched method so the passthrough connection is not
               * intercepted again.
               */
              const socketOptions =
                connectArgs[0] !== null &&
                typeof connectArgs[0] === 'object' &&
                !('href' in connectArgs[0])
                  ? connectArgs[0]
                  : {}

              connectionOptions = transportConnectionOptions
              controller = new TcpSocketController(socket, () => {
                const passthroughSocket = new net.Socket(socketOptions)
                Reflect.apply(
                  realSocketConnect,
                  passthroughSocket,
                  passthroughArgs
                )
                return passthroughSocket
              })
            }

            process.nextTick(() => {
              if (socket.destroyed) {
                return
              }

              if (
                !interceptor.emitter.emit(
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
              ...transportConnectionOptions,
            }

            // Patch the lookup option so DNS lookup always succeeds.
            mockConnectionOptions.lookup = mockLookup

            try {
              /**
               * @note The normalized options are looser than the declared
               * "SocketConnectOpts" (e.g. the port may be a string when a
               * URL is passed). Node.js validates them at runtime.
               * This call goes through the controller's "connect" proxy
               * and lands back in this patch, where the "kPatched" check
               * above delegates it to the unpatched method.
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
        }
      ),
      this.#stopReusingUnpatchedSockets()
    )

    /**
     * @note "net.connect()"/"net.createConnection()" need no patching of
     * their own: both construct a "net.Socket" and call the patched
     * "Socket.prototype.connect" on it.
     */
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
