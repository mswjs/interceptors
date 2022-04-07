import { BatchInterceptor } from '../../BatchInterceptor'
import { WebSocketNativeInterceptor } from './WebSocketNativeInterceptor'
import { WebSocketPollingInterceptor } from './WebSocketPollingInterceptor'

type WebSocketInterceptorList = [
  WebSocketNativeInterceptor,
  WebSocketPollingInterceptor
]

export class WebSocketInterceptor extends BatchInterceptor<WebSocketInterceptorList> {
  constructor() {
    super({
      name: 'websocket-interceptor',
      // WebSocket interception is achieved by intercepting each individual
      // WebSocket transport ("window.WebSocket", HTTP/XMLHttpRequest polling, etc).
      interceptors: [
        new WebSocketNativeInterceptor(),
        new WebSocketPollingInterceptor(),
      ],
    })
  }
}
