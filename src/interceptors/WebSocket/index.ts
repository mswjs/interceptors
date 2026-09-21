import { Interceptor } from '../../interceptor'
import {
  WebSocketConnectionEvent,
  type WebSocketEventMap,
  type WebSocketConnectionInfo,
  type WebSocketConnectionEventData,
} from '../../events/websocket'
import {
  WebSocketClientHandle,
  WebSocketClientConnection,
  type WebSocketClientEventMap,
} from './web-socket-client-connection'
import {
  WebSocketServerHandle,
  WebSocketServerConnection,
  type WebSocketServerEventMap,
} from './web-socket-server-connection'
import { WebSocketClassTransport } from './web-socket-class-transport'
import {
  kClose,
  kPassthroughPromise,
  WebSocketOverride,
} from './web-socket-override'
import { bindEvent } from './utils/bind-event'
import {
  kProtocolContext,
  iterateWebSocketProtocolResult,
  WebSocketProtocol,
  type WebSocketProtocolContext,
} from './web-socket-protocol'
import { hasConfigurableGlobal } from '../../utils/has-configurable-global'
import { patchesRegistry } from '../../utils/patches-registry'
import { createLogger } from '../../utils/logger'
import { runAsInternalConnection } from '../../utils/internal-connection'

export {
  type WebSocketData,
  type WebSocketTransport,
} from './web-socket-transport'
export {
  WebSocketEventMap,
  WebSocketConnectionEvent,
  WebSocketConnectionInfo,
  WebSocketConnectionEventData,
  WebSocketClientEventMap,
  WebSocketClientHandle,
  WebSocketClientConnection,
  WebSocketServerEventMap,
  WebSocketServerHandle,
  WebSocketServerConnection,
}

export {
  CloseEvent,
  CancelableCloseEvent,
  CancelableMessageEvent,
} from './utils/events'

export {
  WebSocketProtocol,
  type WebSocketProtocolContext,
  type WebSocketProtocolMessageContext,
  type WebSocketProtocolResult,
} from './web-socket-protocol'

export interface WebSocketInterceptorOptions {
  /**
   * Protocols to apply to the intercepted connections.
   * The first protocol whose `match()` accepts a connection
   * is applied to it.
   */
  protocols?: Array<WebSocketProtocol>
}

const logger = createLogger('websocket')

/**
 * Intercept the outgoing WebSocket connections created using
 * the global `WebSocket` class.
 */
export class WebSocketInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol.for('websocket-interceptor')

  private readonly protocols: Array<WebSocketProtocol>

  constructor(options: WebSocketInterceptorOptions = {}) {
    super()
    this.protocols = options.protocols ?? []
  }

  protected predicate(): boolean {
    return hasConfigurableGlobal('WebSocket')
  }

  protected setup(): void {
    logger.verbose('setup')

    const WebSocketProxy = new Proxy(globalThis.WebSocket, {
      construct: (
        target,
        args: ConstructorParameters<typeof globalThis.WebSocket>,
        newTarget
      ) => {
        const [url, protocols] = args

        logger.info('connection intercepted %o', {
          url: url.toString(),
          protocols,
        })

        const createConnection = (): WebSocket => {
          return runAsInternalConnection(() => {
            return Reflect.construct(target, args, newTarget)
          })
        }

        // All WebSocket instances are mocked and don't forward
        // any events to the original server (no connection established).
        // To forward the events, the user must use the "server.send()" API.
        const socket = new WebSocketOverride(url, protocols)
        const transport = new WebSocketClassTransport(socket)

        // Emit the "connection" event to the interceptor on the next tick
        // so the client can modify WebSocket options, like "binaryType"
        // while the connection is already pending.
        queueMicrotask(async () => {
          try {
            const server = new WebSocketServerConnection(
              socket,
              transport,
              createConnection
            )

            /**
             * @note Send the protocol handshake before the client
             * connection dispatches its "open" event so the handshake
             * frames precede anything sent from the "open" listeners.
             */
            socket.addEventListener(
              'open',
              () => {
                /**
                 * @note A connection to the original server handshakes itself.
                 * Check that the original connection was created, not its
                 * ready state: it may have already closed by now (e.g. when
                 * the client is kept open past the original server closing),
                 * and the client must not be handshaked twice.
                 */
                if (server['realWebSocket']) {
                  return
                }

                for (const frame of iterateWebSocketProtocolResult(
                  client.protocol?.handshake?.(context)
                )) {
                  transport.send(frame)
                }
              },
              { once: true }
            )

            const client = new WebSocketClientConnection(socket, transport)
            const context: WebSocketProtocolContext = {
              client,
              server,
              info: {
                protocols,
              },
            }
            client[kProtocolContext] = context
            server[kProtocolContext] = context

            this.protocols
              .find((protocol) => protocol.match?.(context))
              ?.apply(context)

            const hasConnectionListeners =
              this.emitter.listenerCount('connection') > 0

            // The "globalThis.WebSocket" class stands for
            // the client-side connection. Assume it's established
            // as soon as the WebSocket instance is constructed.
            await this.emitter.emitAsPromise(
              new WebSocketConnectionEvent({
                client,
                server,
                info: context.info,
              })
            )

            if (hasConnectionListeners) {
              socket[kPassthroughPromise].resolve(false)
            } else {
              socket[kPassthroughPromise].resolve(true)

              server.connect()

              // Forward the "open" event from the original server
              // to the mock WebSocket client in the case of a passthrough connection.
              server.addEventListener('open', () => {
                socket.dispatchEvent(bindEvent(socket, new Event('open')))

                // Forward the original connection protocol to the
                // mock WebSocket client.
                if (server['realWebSocket']) {
                  socket.protocol = server['realWebSocket'].protocol
                }
              })
            }
          } catch (error) {
            /**
             * @note Translate unhandled exceptions during the connection
             * handling (i.e. interceptor exceptions) as WebSocket connection
             * closures with error. This prevents from the exceptions occurring
             * in `queueMicrotask` from being process-wide and uncatchable.
             */
            if (error instanceof Error) {
              socket.dispatchEvent(new Event('error'))

              // No need to close the connection if it's already being closed.
              // E.g. the interceptor called `client.close()` and then threw an error.
              if (
                socket.readyState !== WebSocket.CLOSING &&
                socket.readyState !== WebSocket.CLOSED
              ) {
                socket[kClose](1011, error.message, false)
              }

              console.error(error)
            }
          }
        })

        return socket
      },
    })

    logger.verbose('patching global WebSocket...')

    this.subscriptions.push(
      patchesRegistry.applyPatch(globalThis, 'WebSocket', () => WebSocketProxy)
    )

    logger.verbose('global WebSocket patched: %s', globalThis.WebSocket.name)
  }
}
