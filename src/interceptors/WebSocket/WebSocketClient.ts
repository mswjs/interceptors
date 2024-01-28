import type {
  WebSocketSendData,
  WebSocketTransport,
} from './WebSocketTransport'

const kEmitter = Symbol('emitter')

/**
 * The WebSocket client instance represents an incoming
 * client connection. The user can control the connection,
 * send and receive events.
 */
export class WebSocketClient {
  protected [kEmitter]: EventTarget

  constructor(
    public readonly url: URL,
    protected readonly transport: WebSocketTransport
  ) {
    this[kEmitter] = new EventTarget()

    /**
     * Emit incoming server events so they can be reacted to.
     * @note This does NOT forward the events to the client.
     * That must be done explicitly via "server.send()".
     */
    transport.onIncoming = (event) => {
      this[kEmitter].dispatchEvent(event)
    }
  }

  /**
   * Listen for incoming events from the connected client.
   */
  public on(
    event: string,
    listener: (...data: Array<WebSocketSendData>) => void
  ): void {
    this[kEmitter].addEventListener(event, (event) => {
      if (event instanceof MessageEvent) {
        listener(event.data)
      }
    })
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketSendData): void {
    this.transport.send(data)
  }

  /**
   * Emit the given event to the connected client.
   */
  public emit(event: string, data: WebSocketSendData): void {
    throw new Error('WebSocketClient#emit is not implemented')
  }

  public close(error?: Error): void {
    // Don't do any guessing behind the close code's semantics
    // and fallback to a generic contrived close code of 3000.
    this.transport.close(error ? 3000 : 1000, error?.message)
  }
}
