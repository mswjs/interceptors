import { Interceptor } from '../../Interceptor'
import {
  type WebSocketClientConnectionProtocol,
  WebSocketClientConnection,
} from './WebSocketClientConnection'
import { WebSocketServerConnection } from './WebSocketServerConnection'
import { WebSocketClassTransport } from './WebSocketClassTransport'
import { WebSocketOverride } from './WebSocketOverride'

export { type WebSocketData, WebSocketTransport } from './WebSocketTransport'
export {
  WebSocketClientConnection,
  WebSocketClientConnectionProtocol,
  WebSocketServerConnection,
}

export type WebSocketEventMap = {
  connection: [args: WebSocketConnectionData]
}

export type WebSocketConnectionData = {
  /**
   * The incoming WebSocket client connection.
   */
  client: WebSocketClientConnection

  /**
   * The original WebSocket server connection.
   */
  server: WebSocketServerConnection
}

/**
 * Intercept the outgoing WebSocket connections created using
 * the global `WebSocket` class.
 */
export class WebSocketInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol('websocket')

  constructor() {
    super(WebSocketInterceptor.symbol)
  }

  protected checkEnvironment(): boolean {
    // Enable this interceptor in any environment
    // that has a global WebSocket API.
    return typeof globalThis.WebSocket !== 'undefined'
  }

  protected setup(): void {
    const originalWebSocket = globalThis.WebSocket

    const webSocketProxy = new Proxy(globalThis.WebSocket, {
      construct: (
        target,
        args: ConstructorParameters<typeof globalThis.WebSocket>,
        newTarget
      ) => {
        const [url, protocols] = args

        const createConnection = (): WebSocket => {
          return Reflect.construct(target, args, newTarget)
        }

        // All WebSocket instances are mocked and don't forward
        // any events to the original server (no connection established).
        // To forward the events, the user must use the "server.send()" API.
        const socket = new WebSocketOverride(url, protocols)
        const transport = new WebSocketClassTransport(socket)

        // Emit the "connection" event to the interceptor on the next tick
        // so the client can modify WebSocket options, like "binaryType"
        // while the connection is already pending.
        queueMicrotask(() => {
          // The "globalThis.WebSocket" class stands for
          // the client-side connection. Assume it's established
          // as soon as the WebSocket instance is constructed.
          this.emitter.emit('connection', {
            client: new WebSocketClientConnection(socket, transport),
            server: new WebSocketServerConnection(
              socket,
              transport,
              createConnection
            ),
          })
        })

        return socket
      },
    })

    globalThis.WebSocket = webSocketProxy

    this.subscriptions.push(() => {
      globalThis.WebSocket = originalWebSocket
    })
  }
}
