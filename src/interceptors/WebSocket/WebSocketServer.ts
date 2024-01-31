import type { WebSocketSendData } from './WebSocketTransport'

/**
 * The WebSocket server instance represents the actual production
 * WebSocket server connection. It's idle by default but you can
 * establish it by calling `server.connect()`.
 */
export class WebSocketServer {
  /**
   * Connect to the original WebSocket server.
   */
  public connect(): void {
    throw new Error('WebSocketServer#connect is not implemented')
  }

  /**
   * Send the data to the original server.
   */
  public send(data: WebSocketSendData): void {
    throw new Error('WebSocketServer#send is not implemented')
  }

  /**
   * Listen to the incoming events from the original
   * WebSocket server. All the incoming events are automatically
   * forwarded to the client connection unless you prevent them
   * via `event.preventDefault()`.
   */
  public on<K extends keyof WebSocketEventMap>(
    event: K,
    callback: (this: WebSocket, event: WebSocketEventMap[K]) => void
  ): void {
    throw new Error('WebSocketServer#on is not implemented')
  }
}
