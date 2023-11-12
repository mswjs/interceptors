export type WebSocketData = string | ArrayBufferLike | Blob | ArrayBufferView

/**
 * Transport is an abstract that handles connection events
 * depending on the underlying WebSocket implementation.
 *
 * For example, a standard WebSocket transport can simply
 * dispatch "MessageEvent" to implement "send", while a
 * Socket.io implementation would have to emit a message
 * with a specific numeric prefix to be recognized as data.
 */
export abstract class Transport {
  public open(): void {}
  public send(data: WebSocketData): void {}
  public close(code: number = 1000, reason?: string): void {}
}
