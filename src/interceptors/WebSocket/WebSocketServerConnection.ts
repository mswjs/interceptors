import { invariant } from 'outvariant'
import type { WebSocketOverride } from './WebSocketOverride'
import type { WebSocketData } from './WebSocketTransport'
import type { WebSocketClassTransport } from './WebSocketClassTransport'
import { bindEvent } from './utils/bindEvent'
import { CancelableMessageEvent } from './utils/events'

const kEmitter = Symbol('kEmitter')

/**
 * The WebSocket server instance represents the actual production
 * WebSocket server connection. It's idle by default but you can
 * establish it by calling `server.connect()`.
 */
export class WebSocketServerConnection {
  /**
   * A WebSocket instance connected to the original server.
   */
  private realWebSocket?: WebSocket
  private [kEmitter]: EventTarget

  constructor(
    private readonly socket: WebSocketOverride,
    private readonly transport: WebSocketClassTransport,
    private readonly createConnection: () => WebSocket
  ) {
    this[kEmitter] = new EventTarget()

    // Handle incoming events from the actual server.
    // The (mock) WebSocket instance will call this
    // whenever a "message" event from the actual server
    // is dispatched on it (the dispatch will be skipped).
    this.transport.onIncoming = (event) => {
      // Clone the event to dispatch it on this class
      // once again and prevent the "already being dispatched"
      // exception. Clone it here so we can observe this event
      // being prevented in the "server.on()" listeners.
      const messageEvent = bindEvent(
        this.realWebSocket!,
        new CancelableMessageEvent('message', {
          data: event.data,
          origin: event.origin,
          cancelable: true,
        })
      )

      /**
       * @note Emit "message" event on the WebSocketClassServer
       * instance to let the interceptor know about these
       * incoming events from the original server. In that listener,
       * the interceptor can modify or skip the event forwarding
       * to the mock WebSocket instance.
       */
      this[kEmitter].dispatchEvent(messageEvent)

      /**
       * @note Forward the incoming server events to the client.
       * Preventing the default on the message event stops this.
       */
      if (!messageEvent.defaultPrevented) {
        this.socket.dispatchEvent(
          bindEvent(
            /**
             * @note Bind the forwarded original server events
             * to the mock WebSocket instance so it would
             * dispatch them straight away.
             */
            this.socket,
            // Clone the message event again to prevent
            // the "already being dispatched" exception.
            new MessageEvent('message', {
              data: event.data,
              origin: event.origin,
            })
          )
        )
      }
    }
  }

  /**
   * Server ready state.
   * Proxies the ready state of the original WebSocket instance,
   * if set. If the original connection hasn't been established,
   * defaults to `-1`.
   */
  public get readyState(): number {
    if (this.realWebSocket) {
      return this.realWebSocket.readyState
    }

    return -1
  }

  /**
   * Open connection to the original WebSocket server.
   */
  public connect(): void {
    invariant(
      this.readyState === -1,
      'Failed to call "connect()" on the original WebSocket instance: the connection already open'
    )

    const ws = this.createConnection()

    // Inherit the binary type from the mock WebSocket client.
    ws.binaryType = this.socket.binaryType

    // Close the original connection when the (mock)
    // client closes, regardless of the reason.
    this.socket.addEventListener(
      'close',
      (event) => {
        ws.close(event.code, event.reason)
      },
      { once: true }
    )

    ws.addEventListener('message', (event) => {
      this.transport.onIncoming(event)
    })

    // Forward server errors to the WebSocket client as-is.
    // We may consider exposing them to the interceptor in the future.
    ws.addEventListener('error', () => {
      this.socket.dispatchEvent(bindEvent(this.socket, new Event('error')))
    })

    this.realWebSocket = ws
  }

  /**
   * Listen for the incoming events from the original WebSocket server.
   */
  public addEventListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (this: WebSocket, event: WebSocketEventMap[K]) => void,
    options?: AddEventListenerOptions | boolean
  ): void {
    this[kEmitter].addEventListener(
      event,
      listener.bind(this.realWebSocket!) as EventListener,
      options
    )
  }

  /**
   * Removes the listener for the given event.
   */
  public removeEventListener<K extends keyof WebSocketEventMap>(
    event: K,
    listener: (this: WebSocket, event: WebSocketEventMap[K]) => void,
    options?: EventListenerOptions | boolean
  ): void {
    this[kEmitter].removeEventListener(
      event,
      listener as EventListener,
      options
    )
  }

  /**
   * Send data to the original WebSocket server.
   * @example
   * server.send('hello')
   * server.send(new Blob(['hello']))
   * server.send(new TextEncoder().encode('hello'))
   */
  public send(data: WebSocketData): void {
    const { realWebSocket } = this
    invariant(
      realWebSocket,
      'Failed to call "server.send()" for "%s": the connection is not open. Did you forget to call "await server.connect()"?',
      this.socket.url
    )

    // Delegate the send to when the original connection is open.
    // Unlike the mock, connecting to the original server may take time
    // so we cannot call this on the next tick.
    if (realWebSocket.readyState === realWebSocket.CONNECTING) {
      realWebSocket.addEventListener(
        'open',
        () => {
          realWebSocket.send(data)
        },
        { once: true }
      )
      return
    }

    // Send the data to the original WebSocket server.
    realWebSocket.send(data)
  }
}
