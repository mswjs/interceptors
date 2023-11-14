import { invariant } from 'outvariant'
import { WebSocketTransport } from '../transports/WebSocketTransport'
import { Connection } from './Connection'
import type { WebSocketData } from '../transports/Transport'

/**
 * Connection implementation for the standard "WebSocket"
 * class in JavaScript. Note that with that class you can
 * only emit and accept "MessageEvent".
 */
export class WebSocketConnection extends Connection<WebSocketTransport> {
  constructor(ws: WebSocket) {
    super({
      url: ws.url,
      transport: new WebSocketTransport(ws),
    })

    // Forward the "close" events initialted outside
    // of the connection (e.g. by the client).
    ws.addEventListener(
      'close',
      (event) => this.close(event.code, event.reason),
      { once: true }
    )
  }

  public emit(event: string, data: WebSocketData): void {
    // Throw when emitting arbitrary events when using the
    // standard WebSocket class. Those aren't supported.
    invariant(
      event === 'message',
      `Failed to emit unknown WebSocket event "%s". The standard WebSocket class implementation only supports the "message" event.`,
      event
    )

    this.transport.send(data)
  }

  public close(code = 1000, reason?: string): void {
    /**
     * @todo This should probably not have the same call signature
     * as the client-side "WebSocket.prototype.close". Instead,
     * make the connection "close" method accept an optional "error"
     * and alternatve between a successful and unsuccessful closures.
     */
    this.transport.close(code, reason)
  }
}
