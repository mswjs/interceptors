import type {
  WebSocketSendData,
  WebSocketTransport,
} from './WebSocketTransport'
import { bindEvent } from './utils/bindEvent'

const kEmitter = Symbol('kEmitter')

/**
 * The WebSocket client instance represents an incoming
 * client connection. The user can control the connection,
 * send and receive events.
 */
export class WebSocketClient {
  public readonly url: URL

  protected [kEmitter]: EventTarget

  constructor(
    protected readonly ws: WebSocket,
    protected readonly transport: WebSocketTransport
  ) {
    this.url = new URL(ws.url)
    this[kEmitter] = new EventTarget()

    // Emit outgoing client data ("ws.send()") as "message"
    // events on the client connection.
    this.transport.onOutgoing = (data) => {
      this[kEmitter].dispatchEvent(
        bindEvent(this.ws, new MessageEvent('message', { data }))
      )
    }
  }

  /**
   * Listen for the outgoing events from the connected client.
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
    console.log('WebSocketClient#send', data)
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
