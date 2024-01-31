import type { WebSocketEventsMap } from '../../index'
import { Interceptor } from '../../../../Interceptor'
import { WebSocketClientConnection } from '../../WebSocketClientConnection'
import { WebSocketServerConnection } from '../../WebSocketServerConnection'
import { WebSocketClassTransport } from './WebSocketClassTransport'
import { WebSocketClassOverride } from './WebSocketClassOverride'

export class WebSocketClassInterceptor extends Interceptor<WebSocketEventsMap> {
  static symbol = Symbol('websocket-class')

  constructor() {
    super(WebSocketClassInterceptor.symbol)
  }

  protected checkEnvironment(): boolean {
    // Enable this interceptor in any environment
    // that has a global WebSocket API.
    return typeof globalThis.WebSocket !== 'undefined'
  }

  protected setup(): void {
    const webSocketProxy = Proxy.revocable(globalThis.WebSocket, {
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
        const mockWs = new WebSocketClassOverride(url, protocols)
        const transport = new WebSocketClassTransport(mockWs)

        // The "globalThis.WebSocket" class stands for
        // the client-side connection. Assume it's established
        // as soon as the WebSocket instance is constructed.
        this.emitter.emit('connection', {
          client: new WebSocketClientConnection(mockWs, transport),
          server: new WebSocketServerConnection(
            mockWs,
            createConnection,
            transport
          ),
        })

        return mockWs
      },
    })

    globalThis.WebSocket = webSocketProxy.proxy

    this.subscriptions.push(() => {
      webSocketProxy.revoke()
    })
  }
}
