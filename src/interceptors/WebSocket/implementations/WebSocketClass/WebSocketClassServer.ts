import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketServer } from '../../WebSocketServer'
import type {
  WebSocketClassOverride,
  WebSocketMessageListener,
} from './WebSocketClassInterceptor'
import type { WebSocketSendData } from '../../WebSocketTransport'
import type { WebSocketClassTransport } from './WebSocketClassTransport'
import { bindEvent } from '../../utils/bindEvent'

const kEmitter = Symbol('kEmitter')

export class WebSocketClassServer extends WebSocketServer {
  /**
   * A WebSocket instance connected to the original server.
   */
  private prodWs?: WebSocket
  private [kEmitter]: EventTarget

  constructor(
    private readonly mockWs: WebSocketClassOverride,
    private readonly createConnection: () => WebSocket,
    private readonly transport: WebSocketClassTransport
  ) {
    super()
    this[kEmitter] = new EventTarget()

    // Handle incoming events from the actual server.
    // The (mock) WebSocket instance will call this
    // whenever a "message" event from the actual server
    // is dispatched on it (the dispatch will be skipped).
    this.transport.onIncoming = (event) => {
      /**
       * @note Emit "message" event on the WebSocketClassServer
       * instance to let the interceptor know about these
       * incoming events from the original server. In that listener,
       * the interceptor can modify or skip the event forwarding
       * to the mock WebSocket instance.
       */
      this[kEmitter].dispatchEvent(event)
    }
  }

  public connect(): void {
    invariant(
      !this.prodWs,
      'Failed to call "connect()" on the original WebSocket instance: the connection already open'
    )

    const ws = this.createConnection()

    // Close the original connection when the (mock)
    // client closes, regardless of the reason.
    this.mockWs.addEventListener(
      'close',
      (event) => {
        ws.close(event.code, event.reason)
      },
      { once: true }
    )

    // Once the connection is open, forward any incoming
    // events directly to the (override) WebSocket instance.
    ws.addEventListener('message', (event) => {
      // Clone the event to dispatch it on this class
      // once again and prevent the "already being dispatched"
      // exception. Clone it here so we can observe this event
      // being prevented in the "server.on()" listeners.
      const messageEvent = bindEvent(
        this.prodWs!,
        new MessageEvent('message', {
          data: event.data,
        })
      )
      this.transport.onIncoming(messageEvent)

      // Unless the default is prevented, forward the
      // messages from the original server to the mock client.
      // This is the only way the user can receive them.
      if (!messageEvent.defaultPrevented) {
        this.mockWs.dispatchEvent(
          bindEvent(
            /**
             * @note Bind the forwarded original server events
             * to the mock WebSocket instance so it would
             * dispatch them straight away.
             */
            this.mockWs,
            // Clone the message event again to prevent
            // the "already being dispatched" exception.
            new MessageEvent('message', { data: event.data })
          )
        )
      }
    })

    this.prodWs = ws
  }

  public send(data: WebSocketSendData): void {
    const { prodWs } = this
    invariant(
      prodWs,
      'Failed to call "server.send()" for "%s": the connection is not open. Did you forget to call "await server.connect()"?',
      this.mockWs.url
    )

    // Delegate the send to when the original connection is open.
    // Unlike the mock, connecting to the original server may take time
    // so we cannot call this on the next tick.
    if (prodWs.readyState === prodWs.CONNECTING) {
      prodWs.addEventListener(
        'open',
        () => {
          prodWs.send(data)
        },
        { once: true }
      )
      return
    }

    // Send the data to the original WebSocket server.
    prodWs.send(data)
  }

  public on<K extends keyof WebSocketEventMap>(
    event: K,
    callback: (this: WebSocket, event: WebSocketEventMap[K]) => void
  ): void {
    this[kEmitter].addEventListener(event, (event) => {
      callback.call(this.prodWs!, event as any)
    })
  }
}
