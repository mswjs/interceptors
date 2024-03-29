import { invariant } from 'outvariant'
import { kClose, WebSocketOverride } from './WebSocketOverride'
import type { WebSocketData } from './WebSocketTransport'
import type { WebSocketClassTransport } from './WebSocketClassTransport'
import { bindEvent } from './utils/bindEvent'
import { CancelableMessageEvent, CloseEvent } from './utils/events'

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
  private mockCloseController: AbortController
  private [kEmitter]: EventTarget

  constructor(
    private readonly socket: WebSocketOverride,
    private readonly transport: WebSocketClassTransport,
    private readonly createConnection: () => WebSocket
  ) {
    this[kEmitter] = new EventTarget()
    this.mockCloseController = new AbortController()

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
      !this.realWebSocket || this.realWebSocket.readyState !== WebSocket.OPEN,
      'Failed to call "connect()" on the original WebSocket instance: the connection already open'
    )

    const realWebSocket = this.createConnection()

    // Inherit the binary type from the mock WebSocket client.
    realWebSocket.binaryType = this.socket.binaryType

    // Allow the interceptor to listen to when the server connection
    // has been established. This isn't necessary to operate with the connection
    // but may be beneficial in some cases (like conditionally adding logging).
    realWebSocket.addEventListener(
      'open',
      (event) => {
        this[kEmitter].dispatchEvent(
          bindEvent(this.realWebSocket!, new Event('open', event))
        )
      },
      { once: true }
    )

    realWebSocket.addEventListener('message', (event) => {
      this.transport.onIncoming(event)
    })

    // Close the original connection when the mock client closes.
    // E.g. "client.close()" was called.
    this.socket.addEventListener('close', this.handleMockClose.bind(this), {
      signal: this.mockCloseController.signal,
    })

    // Forward the "close" event to let the interceptor handle
    // closures initiated by the original server.
    realWebSocket.addEventListener('close', this.handleRealClose.bind(this))

    // Forward server errors to the WebSocket client as-is.
    // We may consider exposing them to the interceptor in the future.
    realWebSocket.addEventListener('error', () => {
      this.socket.dispatchEvent(bindEvent(this.socket, new Event('error')))
    })

    this.realWebSocket = realWebSocket
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
   * Remove the listener for the given event.
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
      'Failed to call "server.send()" for "%s": the connection is not open. Did you forget to call "server.connect()"?',
      this.socket.url
    )

    // Silently ignore writes on the closed original WebSocket.
    if (
      realWebSocket.readyState === WebSocket.CLOSING ||
      realWebSocket.readyState === WebSocket.CLOSED
    ) {
      return
    }

    // Delegate the send to when the original connection is open.
    // Unlike the mock, connecting to the original server may take time
    // so we cannot call this on the next tick.
    if (realWebSocket.readyState === WebSocket.CONNECTING) {
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

  /**
   * Close the actual server connection.
   */
  public close(): void {
    const { realWebSocket } = this

    invariant(
      realWebSocket,
      'Failed to close server connection for "%s": the connection is not open. Did you forget to call "server.connect()"?',
      this.socket.url
    )

    // Remove the "close" event listener from the server
    // so it doesn't close the underlying WebSocket client
    // when you call "server.close()".
    realWebSocket.removeEventListener('close', this.handleRealClose)

    if (
      realWebSocket.readyState === WebSocket.CLOSING ||
      realWebSocket.readyState === WebSocket.CLOSED
    ) {
      return
    }

    realWebSocket.close()

    // Dispatch the "close" event on the server connection.
    queueMicrotask(() => {
      this[kEmitter].dispatchEvent(
        bindEvent(this.realWebSocket, new CloseEvent('close'))
      )
    })
  }

  private handleMockClose(_event: Event): void {
    // Close the original connection if the mock client closes.
    if (this.realWebSocket) {
      this.realWebSocket.close()
    }
  }

  private handleRealClose(event: CloseEvent): void {
    // For closures originating from the original server,
    // remove the "close" listener from the mock client.
    // original close -> (?) client[kClose]() --X-> "close" (again).
    this.mockCloseController.abort()

    const closeEvent = bindEvent(
      this.realWebSocket,
      new CloseEvent('close', event)
    )

    this[kEmitter].dispatchEvent(closeEvent)

    // If the close event from the server hasn't been prevented,
    // forward the closure to the mock client.
    if (!closeEvent.defaultPrevented) {
      // Close the intercepted client forcefully to
      // allow non-configurable status codes from the server.
      // If the socket has been closed by now, no harm calling
      // this again—it will have no effect.
      this.socket[kClose](event.code, event.reason)
    }
  }
}
