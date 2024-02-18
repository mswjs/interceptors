export type WebSocketData = string | ArrayBufferLike | Blob | ArrayBufferView

export type WebSocketTransportOnIncomingCallback = (
  event: MessageEvent<WebSocketData>
) => void

export type WebSocketTransportOnOutgoingCallback = (data: WebSocketData) => void

export type WebSocketTransportOnCloseCallback = (event: CloseEvent) => void

export abstract class WebSocketTransport {
  /**
   * A callback for the incoming server events.
   * This is called when the WebSocket client receives
   * a message from the server.
   */
  abstract onIncoming: WebSocketTransportOnIncomingCallback

  /**
   * A callback for outgoing client events.
   * This is called when the WebSocket client sends data.
   */
  abstract onOutgoing: WebSocketTransportOnOutgoingCallback

  /**
   * A callback for the close client event.
   * This is called when the WebSocket client is closed.
   */
  abstract onClose: WebSocketTransportOnCloseCallback

  /**
   * Send the data from the server to this client.
   */
  abstract send(data: WebSocketData): void

  /**
   * Close the client connection.
   */
  abstract close(code?: number, reason?: string): void
}
