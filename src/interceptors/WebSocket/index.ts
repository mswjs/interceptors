import { Interceptor } from '../../Interceptor'
import type { WebSocketConnection } from './connections/WebSocketConnection'
import { WebSocketController } from './WebSocketController'

export type WebSocketEventMap = {
  connection: [WebSocketConnection]
}

export class WebSocketInterceptor extends Interceptor<WebSocketEventMap> {
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
    const WebSocketProxy = Proxy.revocable(globalThis.WebSocket, {
      construct: (
        target,
        args: ConstructorParameters<typeof globalThis.WebSocket>,
        newTarget
      ) => {
        const originalWebSocket = Reflect.construct(target, args, newTarget)
        const controller = new WebSocketController(originalWebSocket)

        this.emitter.emit('connection', controller.connection)

        return controller.ws
      },
    })

    globalThis.WebSocket = WebSocketProxy.proxy

    this.subscriptions.push(() => {
      WebSocketProxy.revoke()
    })
  }
}
