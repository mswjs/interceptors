import { invariant } from 'outvariant'
import { WebSocketClient } from '../../WebSocketClient'
import type { WebSocketSendData } from '../../WebSocketTransport'
import { WebSocketClassTransport } from './WebSocketClassTransport'
import type { WebSocketClassOverride } from './WebSocketClassInterceptor'

export class WebSocketClassClient extends WebSocketClient {
  constructor(
    readonly ws: WebSocketClassOverride,
    readonly transport: WebSocketClassTransport
  ) {
    super(new URL(ws.url), transport)
  }

  public emit(event: string, data: WebSocketSendData): void {
    invariant(
      event === 'message',
      'Failed to emit unknown WebSocket event "%s": only the "message" event is supported using the standard WebSocket class',
      event
    )

    this.transport.send(data)
  }
}
