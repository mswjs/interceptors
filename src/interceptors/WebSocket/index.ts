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
import type { WebSocketData } from './web-socket-transport'
import {
  kClose,
  kPassthroughPromise,
  WebSocketOverride,
} from './web-socket-override'
import { bindEvent } from './utils/bind-event'
import {
  kExtensionContext,
  iterateWebSocketExtensionResult,
  WebSocketExtension,
  type WebSocketExtensionContext,
  type WebSocketExtensionMessage,
  type WebSocketExtensionApi,
} from './web-socket-extension'
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
  WebSocketExtension,
  type WebSocketExtensionContext,
  type WebSocketExtensionMessageContext,
  type WebSocketExtensionResult,
  type WebSocketExtensionMessage,
  type WebSocketExtensionApi,
} from './web-socket-extension'

type WebSocketExtensions = ReadonlyArray<WebSocketExtension<unknown, unknown>>

/**
 * The messages crossing the connections intercepted with the given
 * extensions: the messages of the extension applied to a connection,
 * or raw WebSocket data when there are no extensions.
 *
 * @note The types assume one of the extensions matches the connection.
 */
export type WebSocketInterceptorMessage<
  Extensions extends WebSocketExtensions,
> = [Extensions] extends [readonly []]
  ? WebSocketData
  : WebSocketExtensionMessage<Extensions[number]>

/**
 * The API the extension applied to a connection adds to the connection event.
 */
export type WebSocketInterceptorApi<Extensions extends WebSocketExtensions> = [
  Extensions,
] extends [readonly []]
  ? {}
  : WebSocketExtensionApi<Extensions[number]>

export interface WebSocketInterceptorOptions<
  Extensions extends WebSocketExtensions = [],
> {
  /**
   * Extensions to apply to the intercepted connections.
   * The first extension whose `match()` accepts a connection is applied
   * to it. An extension without `match()` accepts every connection.
   */
  extensions?: Extensions
}

const logger = createLogger('websocket')

/**
 * Intercept the outgoing WebSocket connections created using
 * the global `WebSocket` class.
 */
export class WebSocketInterceptor<
  const Extensions extends WebSocketExtensions = [],
> extends Interceptor<
  WebSocketEventMap<
    WebSocketInterceptorMessage<Extensions>,
    WebSocketInterceptorApi<Extensions>
  >
> {
  static symbol = Symbol.for('websocket-interceptor')

  private readonly extensions: WebSocketExtensions

  constructor(options: WebSocketInterceptorOptions<Extensions> = {}) {
    super()
    this.extensions = options.extensions ?? []
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
             * @note The mocked connection plays the server endpoint of the
             * protocol unless a connection to the original server was
             * created, in which case the original server speaks for itself.
             * Check the creation, not the ready state: the original connection
             * may have already closed by now (e.g. when the client is kept open
             * past the original server closing), and the client must not be
             * handshaked twice.
             */
            const isServerEndpoint = () => server['realWebSocket'] == null

            /**
             * @note Register these before the client connection so the
             * protocol frames precede anything sent from its listeners.
             */
            socket.addEventListener(
              'open',
              () => {
                if (!isServerEndpoint()) {
                  return
                }

                for (const frame of iterateWebSocketExtensionResult(
                  client.extension?.connect?.(context)
                )) {
                  transport.send(frame)
                }
              },
              { once: true }
            )

            transport.addEventListener('outgoing', (event) => {
              if (!isServerEndpoint()) {
                return
              }

              for (const frame of iterateWebSocketExtensionResult(
                client.extension?.receive?.(event.data, context)
              )) {
                transport.send(frame)
              }
            })

            const client = new WebSocketClientConnection(socket, transport)
            const context: WebSocketExtensionContext = {
              client,
              server,
              info: {
                protocols,
              },
            }
            client[kExtensionContext] = context
            server[kExtensionContext] = context

            const extension = this.extensions.find((extension) => {
              return extension.match?.(context) ?? true
            })
            extension?.apply(context)

            const hasConnectionListeners =
              this.emitter.listenerCount('connection') > 0

            // The "globalThis.WebSocket" class stands for
            // the client-side connection. Assume it's established
            // as soon as the WebSocket instance is constructed.
            /**
             * @note Expose the extension's own API (e.g. rooms) on the
             * connection event. The event map is inferred from the extensions
             * this interceptor was given; `Object.assign` with a spread of
             * sources is untyped, which is what lets the event take that type.
             */
            const extensionApis: Array<unknown> = [extension?.extend?.(context)]

            await this.emitter.emitAsPromise(
              Object.assign(
                new WebSocketConnectionEvent({
                  client,
                  server,
                  info: context.info,
                }),
                ...extensionApis
              )
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
