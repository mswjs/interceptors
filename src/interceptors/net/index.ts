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
              logger.verbose(
                'no "connection" listeners found on the interceptor, passthrough...'
              )

              controller.passthrough()
              return
            }

            logger.verbose('emitted "connection" event!')
          })

          logger.verbose('connecting the socket...')

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
          logger.verbose('tls.connect() %o', args)

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
