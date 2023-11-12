import { invariant } from 'outvariant'
import { WebSocketTransport } from '../transports/WebSocketTransport'
import { Connection } from './Connection'
import type { WebSocketData } from '../transports/Transport'

/**
 * Connection implementation for the standard "WebSocket"
 * class in JavaScript. Note that with that class you can
 * only emit and accept "MessageEvent".
 */
export class WebSocketConnection extends Connection {
  constructor(ws: WebSocket) {
    super({
      url: ws.url,
      transport: new WebSocketTransport(ws),
    })
  }

  public emit(event: string, data: WebSocketData): void {
    // Throw when emitting arbitrary events with the standard
    // WebSocket class usage. That's against the spec.
    invariant(
      event === 'message',
      `Failed to emit unknown WebSocket event "%s". The standard WebSocket class implementation only supports the "message" event.`,
      event
    )

    this.transport.send(data)
  }

  public close(code = 1000, reason?: string): void {
    this.transport.close(code, reason)
  }
}
