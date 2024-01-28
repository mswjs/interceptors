export type WebSocketSendData =
  | string
  | ArrayBufferLike
  | Blob
  | ArrayBufferView

export type WebSocketTransportOnIncomingCallback = (
  event: MessageEvent<WebSocketSendData>
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

  /**
   * Send the data from the server to this client.
   */
  abstract send(data: WebSocketSendData): void

  /**
   * Close the client connection.
   */
  abstract close(code: number, reason?: string): void
}
