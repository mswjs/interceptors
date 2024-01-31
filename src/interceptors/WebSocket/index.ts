import { BatchInterceptor } from '../..'
import type { WebSocketClientConnection } from './WebSocketClientConnection'
import type { WebSocketServerConnection } from './WebSocketServerConnection'
import { WebSocketClassInterceptor } from './implementations/WebSocketClass/WebSocketClassInterceptor'

export type WebSocketEventsMap = {
  connection: [
    args: {
      /**
       * The connected WebSocket client.
       */
      client: WebSocketClientConnection

      /**
       * The original WebSocket server.
       */
      server: WebSocketServerConnection
    }
  ]
}

export class WebSocketInterceptor extends BatchInterceptor<
  [WebSocketClassInterceptor],
  WebSocketEventsMap
> {
  constructor() {
    super({
      name: 'websocket',
      interceptors: [new WebSocketClassInterceptor()],
    })
  }
}
