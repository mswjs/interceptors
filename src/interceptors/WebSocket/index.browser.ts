import type { WebSocketEventMap } from '../../glossary'
import type { Interceptor } from '../../Interceptor'
import { BatchInterceptor } from '../../BatchInterceptor'
import { XMLHttpRequestInterceptor } from '../XMLHttpRequest'
import { WebSocketNativeInterceptor } from './WebSocketNativeInterceptor'
import { WebSocketPollingInterceptor } from './WebSocketPollingInterceptor'

// WebSocket interception is achieved by intercepting each individual
// WebSocket transport ("window.WebSocket", HTTP/XMLHttpRequest polling, etc).
const interceptors: Interceptor<WebSocketEventMap>[] = [
  new WebSocketNativeInterceptor(),
  new WebSocketPollingInterceptor({
    using: new XMLHttpRequestInterceptor(),
  }),
]

export class WebSocketInterceptor extends BatchInterceptor<
  typeof interceptors
> {
  constructor() {
    super({
      name: 'websocket-interceptor',
      interceptors,
    })
  }
}
