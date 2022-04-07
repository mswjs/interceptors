import type { WebSocketEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { createWebSocketOverride } from './WebSocketOverride'

export class WebSocketNativeInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol('websocket-native-interceptor')

  constructor() {
    super(WebSocketNativeInterceptor.symbol)
  }

  protected checkEnvironment() {
    // This interceptor targets the "window.WebSocket" class
    // and will only work in the browser, where such class exists.
    return (
      typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined'
    )
  }

  protected setup() {
    const log = this.log.extend('setup')

    const PureWebSocket = window.WebSocket
    const WebSocketOverride = createWebSocketOverride({
      WebSocket: PureWebSocket,
      emitter: this.emitter,
    })

    window.WebSocket = WebSocketOverride
    log('native "window.WebSocket" patched!', window.WebSocket.constructor.name)

    this.subscriptions.push(() => {
      window.WebSocket = PureWebSocket
      log(
        'native "window.WebSocket" restored!',
        window.WebSocket.constructor.name
      )
    })
  }
}
