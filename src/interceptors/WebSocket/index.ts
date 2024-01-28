import { BatchInterceptor } from '../..'
import { WebSocketClient } from './WebSocketClient'
import { WebSocketServer } from './WebSocketServer'
import { WebSocketClassInterceptor } from './implementations/WebSocketClass/WebSocketClassInterceptor'

export type WebSocketEventsMap = {
  connection: [
    args: {
      /**
       * The connected WebSocket client.
       */
      client: WebSocketClient
      /**
       * The original WebSocket server.
       */
      server: WebSocketServer
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
