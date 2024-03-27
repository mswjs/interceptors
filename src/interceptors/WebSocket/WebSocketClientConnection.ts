/**
 * WebSocket client class.
 * This represents an incoming WebSocket client connection.
 * @note Keep this class implementation-agnostic because it's
 * meant to be used over any WebSocket implementation
 * (not all of them follow the one from WHATWG).
 */
import type { WebSocketData, WebSocketTransport } from './WebSocketTransport'
import { WebSocketEventListener } from './WebSocketOverride'
import { bindEvent } from './utils/bindEvent'
import { CloseEvent } from './utils/events'
import { createRequestId } from '../../createRequestId'

const kEmitter = Symbol('kEmitter')

interface WebSocketClientEventMap {
  message: MessageEvent<WebSocketData>
  close: CloseEvent
}

export interface WebSocketClientConnectionProtocol {
  id: string
  url: URL
  send(data: WebSocketData): void
  close(code?: number, reason?: string): void
}

/**
 * The WebSocket client instance represents an incoming
 * client connection. The user can control the connection,
 * send and receive events.
 */
export class WebSocketClientConnection
  implements WebSocketClientConnectionProtocol
{
  public readonly id: string
  public readonly url: URL

  private [kEmitter]: EventTarget

  constructor(
    public readonly socket: WebSocket,
    private readonly transport: WebSocketTransport
  ) {
    this.id = createRequestId()
    this.url = new URL(socket.url)
    this[kEmitter] = new EventTarget()

    // Emit outgoing client data ("ws.send()") as "message"
    // events on the client connection.
    this.transport.onOutgoing = (data) => {
      this[kEmitter].dispatchEvent(
        bindEvent(this.socket, new MessageEvent('message', { data }))
      )
    }

    this.transport.onClose = (event) => {
      this[kEmitter].dispatchEvent(
        bindEvent(this.socket, new CloseEvent('close', event))
      )
    }
  }

  /**
   * Listen for the outgoing events from the connected WebSocket client.
   */
  public addEventListener<EventType extends keyof WebSocketClientEventMap>(
    type: EventType,
    listener: WebSocketEventListener<WebSocketClientEventMap[EventType]>,
    options?: AddEventListenerOptions | boolean
  ): void {
    this[kEmitter].addEventListener(type, listener as EventListener, options)
  }

  /**
   * Removes the listener for the given event.
   */
  public removeEventListener<EventType extends keyof WebSocketClientEventMap>(
    event: EventType,
    listener: WebSocketEventListener<WebSocketClientEventMap[EventType]>,
    options?: EventListenerOptions | boolean
  ): void {
    this[kEmitter].removeEventListener(
      event,
      listener as EventListener,
      options
    )
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketData): void {
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
