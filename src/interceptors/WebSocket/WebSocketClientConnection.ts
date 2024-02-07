/**
 * WebSocket client class.
 * This represents an incoming WebSocket client connection.
 * @note Keep this class implementation-agnostic because it's
 * meant to be used over any WebSocket implementation
 * (not all of them follow the one from WHATWG).
 */
import type { WebSocketRawData, WebSocketTransport } from './WebSocketTransport'
import { WebSocketMessageListener } from './WebSocketOverride'
import { bindEvent } from './utils/bindEvent'

const kEmitter = Symbol('kEmitter')

/**
 * The WebSocket client instance represents an incoming
 * client connection. The user can control the connection,
 * send and receive events.
 */
export class WebSocketClientConnection {
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
   * Listen for the outgoing events from the connected WebSocket client.
   */
  public addEventListener(
    event: string,
    listener: WebSocketMessageListener,
    options?: AddEventListenerOptions | boolean
  ): void {
    this[kEmitter].addEventListener(
      event,
      (event) => {
        if (event instanceof MessageEvent) {
          listener.call(this.ws, event)
        }
      },
      options
    )
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketRawData): void {
    this.transport.send(data)
  }

  /**
   * Close the WebSocket connection.
   * @param {number} code A status code (see https://www.rfc-editor.org/rfc/rfc6455#section-7.4.1).
   * @param {string} reason A custom connection close reason.
   */
  public close(code?: number, reason?: string): void {
    this.transport.close(code, reason)
  }
}
