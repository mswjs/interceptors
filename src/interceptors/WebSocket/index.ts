import { Interceptor } from '../../Interceptor'
import type { WebSocketConnection } from './connections/WebSocketConnection'
import { WebSocketController } from './WebSocketController'

export type WebSocketInterceptorEventMap = {
  connection: [WebSocketConnection]
}

export class WebSocketInterceptor extends Interceptor<WebSocketInterceptorEventMap> {
  static interceptorSymbol = Symbol('websocket-class-interceptor')

  constructor() {
    super(WebSocketInterceptor.interceptorSymbol)
  }

  protected checkEnvironment(): boolean {
    return (
      typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined'
    )
  }

  protected setup(): void {
    const OriginalWebSocket = globalThis.WebSocket

    const WebSocketProxy = Proxy.revocable(globalThis.WebSocket, {
      construct: (
        _,
        args: ConstructorParameters<typeof globalThis.WebSocket>
      ) => {
        const [url, protocols] = args
        const controller = new WebSocketController({
          url,
          protocols,
          emitter: this.emitter,
          WebSocketClass: OriginalWebSocket,
        })

        return controller.ws
      },
    })

    globalThis.WebSocket = WebSocketProxy.proxy

    this.subscriptions.push(() => {
      WebSocketProxy.revoke()
    })
  }
}
