import { invariant } from 'outvariant'
import { Connection } from './Connection'
import { WebSocketTransport } from './transports/WebSocketTransport'

export class WebSocketConnection extends Connection {
  constructor(protected readonly socket: WebSocket) {
    super({
      name: 'websocket',
      transport: new WebSocketTransport(socket),
    })
  }

  public emit(event: string, ...data: any): void {
    invariant(
      event === 'message',
      'Failed to emit unknown WebSocket "%s" event. The native WebSocket implementation only supports the "message" event.',
      event
    )

    this.transport.send(data)
  }
}
