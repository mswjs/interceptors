import type { WebSocketData, WebSocketTransport } from './WebSocketTransport'
import { WebSocketEventListener } from './WebSocketOverride'
import { bindEvent } from './utils/bindEvent'
import { CancelableMessageEvent, CloseEvent } from './utils/events'
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
    // events on the "client" connection.
    this.transport.addEventListener('outgoing', (event) => {
      const message = bindEvent(
        this.socket,
        new CancelableMessageEvent('message', {
          data: event.data,
          origin: event.origin,
          cancelable: true,
        })
      )

      this[kEmitter].dispatchEvent(message)

      // This is a bit silly but forward the cancellation state
      // of the "client" message event to the "outgoing" transport event.
      // This way, other agens (like "server" connection) can know
      // whether the client listener has pervented the default.
      if (message.defaultPrevented) {
        event.preventDefault()
      }
    })

    /**
     * Emit the "close" event on the "client" connection
     * whenever the underlying transport is closed.
     * @note "client.close()" does NOT dispatch the "close"
     * event on the WebSocket because it uses non-configurable
     * close status code. Thus, we listen to the transport
     * instead of the WebSocket's "close" event.
     */
    this.transport.addEventListener('close', (event) => {
      this[kEmitter].dispatchEvent(
        bindEvent(this.socket, new CloseEvent('close', event))
      )
    })
  }

  /**
   * Listen for the outgoing events from the connected WebSocket client.
   */
  public addEventListener<EventType extends keyof WebSocketClientEventMap>(
    type: EventType,
    listener: WebSocketEventListener<WebSocketClientEventMap[EventType]>,
    options?: AddEventListenerOptions | boolean
  ): void {
    this[kEmitter].addEventListener(
      type,
      listener.bind(this.socket) as EventListener,
      options
    )
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
