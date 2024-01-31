export type WebSocketRawData = string | ArrayBufferLike | Blob | ArrayBufferView

export type WebSocketTransportOnIncomingCallback = (
  event: MessageEvent<WebSocketRawData>
) => void

export type WebSocketTransportOnOutgoingCallback = (
  data: WebSocketRawData
) => void

export abstract class WebSocketTransport {
  /**
   * Listener for the incoming server events.
   * This is called when the client receives the
   * event from the original server connection.
   *
   * This way, we can trigger the "message" event
   * on the mocked connection to let the user know.
   */
  abstract onIncoming: WebSocketTransportOnIncomingCallback
  abstract onOutgoing: WebSocketTransportOnOutgoingCallback

  /**
   * Send the data from the server to this client.
   */
  abstract send(data: WebSocketRawData): void

  /**
   * Close the client connection.
   */
  abstract close(code?: number, reason?: string): void
}
