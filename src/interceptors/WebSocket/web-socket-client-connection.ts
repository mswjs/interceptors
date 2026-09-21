import type { WebSocketData, WebSocketTransport } from './web-socket-transport'
import type { WebSocketEventListener } from './web-socket-override'
import { bindEvent } from './utils/bind-event'
import { CancelableMessageEvent, CloseEvent } from './utils/events'
import { createRequestId } from '../../create-request-id'
import {
  kProtocolContext,
  iterateWebSocketProtocolResult,
  type WebSocketProtocol,
  type WebSocketProtocolContext,
  type WebSocketProtocolMessageContext,
} from './web-socket-protocol'

const kEmitter = Symbol('kEmitter')
const kBoundListener = Symbol('kBoundListener')

export interface WebSocketClientEventMap {
  open: Event
  message: MessageEvent<WebSocketData>
  close: CloseEvent
}

/**
 * The handle to a WebSocket client connection: its identity and controls.
 * A handle is what a connection is regardless of where it lives.
 * A `WebSocketClientConnection` is a handle bound to a connection in this
 * process; a handle can also be revived from a serialized connection
 * in another process (e.g. a connection stored by a worker).
 */
export abstract class WebSocketClientHandle {
  abstract id: string
  abstract url: URL
  public protocol?: WebSocketProtocol
  public abstract send(data: WebSocketData): void
  public abstract close(code?: number, reason?: string): void

  public abstract addEventListener<
    EventType extends keyof WebSocketClientEventMap,
  >(
    type: EventType,
    listener: WebSocketEventListener<WebSocketClientEventMap[EventType]>,
    options?: AddEventListenerOptions | boolean
  ): void

  public abstract removeEventListener<
    EventType extends keyof WebSocketClientEventMap,
  >(
    event: EventType,
    listener: WebSocketEventListener<WebSocketClientEventMap[EventType]>,
    options?: EventListenerOptions | boolean
  ): void
}

/**
 * The WebSocket client instance represents an incoming
 * client connection. The user can control the connection,
 * send and receive events.
 */
export class WebSocketClientConnection implements WebSocketClientHandle {
  public readonly id: string
  public readonly url: URL

  /**
   * An optional protocol applied to the data crossing this connection:
   * `send()` encodes, outgoing client frames are decoded
   * before being dispatched as `message` events.
   */
  public protocol?: WebSocketProtocol

  /**
   * The intercepted connection this client belongs to.
   * Provided by the interceptor once both connections exist.
   */
  public [kProtocolContext]?: WebSocketProtocolContext

  private [kEmitter]: EventTarget

  constructor(
    public readonly socket: WebSocket,
    private readonly transport: WebSocketTransport
  ) {
    this.id = createRequestId()
    this.url = new URL(socket.url)
    this[kEmitter] = new EventTarget()

    /**
     * Emit the "open" event on the "client" connection once the
     * client connection is open. This is either the mocked connection
     * opening or, for passthrough connections, the original server
     * connection opening (forwarded to the client by the interceptor).
     */
    this.socket.addEventListener(
      'open',
      () => {
        this[kEmitter].dispatchEvent(bindEvent(this.socket, new Event('open')))
      },
      { once: true }
    )

    // Emit outgoing client data ("ws.send()") as "message"
    // events on the "client" connection.
    this.transport.addEventListener('outgoing', (event) => {
      // A single frame may decode into any number of messages
      // (e.g. none for protocol control frames).
      const messages = this.protocol
        ? iterateWebSocketProtocolResult(
            this.protocol.decode(event.data, this.#getMessageContext())
          )
        : [event.data]
      let defaultPrevented = false

      for (const data of messages) {
        const message = bindEvent(
          this.socket,
          new CancelableMessageEvent('message', {
            data,
            origin: event.origin,
            cancelable: true,
          })
        )

        this[kEmitter].dispatchEvent(message)
        defaultPrevented ||= message.defaultPrevented
      }

      // This is a bit silly but forward the cancellation state
      // of the "client" message event to the "outgoing" transport event.
      // This way, other agens (like "server" connection) can know
      // whether the client listener has pervented the default.
      if (defaultPrevented) {
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
    if (!Reflect.has(listener, kBoundListener)) {
      const boundListener = listener.bind(this.socket)

      // Store the bound listener on the original listener
      // so the exact bound function can be accessed in "removeEventListener()".
      Object.defineProperty(listener, kBoundListener, {
        value: boundListener,
        enumerable: false,
        configurable: false,
      })
    }

    this[kEmitter].addEventListener(
      type,
      Reflect.get(listener, kBoundListener) as EventListener,
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
      Reflect.get(listener, kBoundListener) as EventListener,
      options
    )
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketData): void {
    if (!this.protocol) {
      this.transport.send(data)
      return
    }

    for (const frame of iterateWebSocketProtocolResult(
      this.protocol.encode(data, this.#getMessageContext())
    )) {
      this.transport.send(frame)
    }
  }

  #getMessageContext(): WebSocketProtocolMessageContext {
    const context = this[kProtocolContext]

    if (!context) {
      throw new Error(
        `Failed to apply the protocol to the client connection "${this.url.href}": the connection context is missing`
      )
    }

    return { ...context, connection: this }
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
