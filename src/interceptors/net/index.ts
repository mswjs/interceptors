import net from 'node:net'
import tls from 'node:tls'
import { TypedEvent } from 'rettime'
import {
  type NetworkConnectionOptions,
  normalizeNetConnectArgs,
} from './utils/normalize-net-connect-args'
import {
  kPatched,
  TcpSocketController,
  TlsSocketController,
  type TcpHandle,
} from './socket-controller'
import { normalizeTlsConnectArgs } from './utils/normalize-tls-connect-args'
import { createLogger } from '../../utils/logger'
import {
  patchesRegistry,
  getDeepPropertyDescriptor,
} from '../../utils/patchesRegistry'
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

const logger = createLogger('socket')

/**
 * Returns true if the given socket has been explicitly unrefed.
 * The ref state lives on the socket's handle. Some handles (e.g. `TLSWrap`)
 * don't implement it themselves and defer to their parent handle (`TCP`).
 */
function isSocketUnrefed(socket: net.Socket): boolean {
  let handle: TcpHandle | undefined = socket._handle

  while (handle) {
    if (typeof handle.hasRef === 'function') {
      return !handle.hasRef()
    }

    handle = handle._parent
  }

  return false
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

          const mockConnectionOptions = {
            ...connectionOptions,
            /**
             * @note Do not bind the intercepted socket to the requested
             * local address/port. The passthrough connection binds them
             * for real, and binding twice results in a conflict.
             */
            localAddress: undefined,
            localPort: undefined,
          }

          // Patch the lookup option so DNS lookup always succeeds.
          // Passthrough connections are created with the original options and won't be affected.
          mockConnectionOptions.lookup = function mockLookup(
            hostname,
            dnsOptions,
            callback
          ) {
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

          try {
            return socket.connect(mockConnectionOptions, connectionCallback)
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

          const controller = new TlsSocketController(tlsSocket, () => {
            return realTlsConnect(...passthroughArgs)
          })

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
   * Prevent the `net.Socket` instances created before this interceptor was applied
   * from getting reused by the `Agent` after the interceptor is applied.
   */
  #stopReusingUnpatchedSockets(): () => void {
    const match = getDeepPropertyDescriptor(net.Socket.prototype, 'destroyed')

    if (
      match == null ||
      match.descriptor.get == null ||
      match.descriptor.set == null
    ) {
      return () => {}
    }

    const { get: realDestroyedGetter, set: realDestroyedSetter } =
      match.descriptor

    Object.defineProperty(net.Socket.prototype, 'destroyed', {
      configurable: true,
      get(this: net.Socket) {
        const realDestroyed = realDestroyedGetter.call(this)

        if (realDestroyed || this[kPatched]) {
          return realDestroyed
        }

        /**
         * @note Agent pings every free socket via "socket.destroyed" to see
         * if they can be reused. If such a ping is detected on an unpatched socket,
         * destroy it. That forces the agent to issue a new socket, which will call
         * "net.connect" again, falling through the interception.
         *
         * A socket idle in an `Agent` keep-alive pool is detected via
         * documented agent contracts rather than internal listener names:
         * - Pooled sockets listen to the "agentRemove" event (documented as
         *   the way to remove a socket from the agent);
         * - `agent.keepSocketAlive()` unrefs a socket when pooling it, and
         *   `agent.reuseSocket()` refs it on reuse (both are the documented
         *   default implementations);
         * - A socket detached from a request has no `_httpMessage`.
         */
        if (
          !this.connecting &&
          this.listenerCount('agentRemove') > 0 &&
          !this._httpMessage &&
          isSocketUnrefed(this)
        ) {
          this.destroy()
          return true
        }

        return realDestroyed
      },
      // Attach a setter for behavior parity.
      set(this: net.Socket, value: boolean) {
        realDestroyedSetter.call(this, value)
      },
    })

    return () => {
      if (match.owner === net.Socket.prototype) {
        // The real descriptor was an own property, restore it in-place.
        Object.defineProperty(
          net.Socket.prototype,
          'destroyed',
          match.descriptor
        )
      } else {
        // The real descriptor lives up the prototype chain (stream.Duplex),
        // deleting the shadow restores the original lookup.
        Reflect.deleteProperty(net.Socket.prototype, 'destroyed')
      }
    }
  }
}
