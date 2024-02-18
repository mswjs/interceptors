import { bindEvent } from './utils/bindEvent'
import {
  WebSocketData,
  WebSocketTransport,
  WebSocketTransportOnCloseCallback,
  WebSocketTransportOnIncomingCallback,
  WebSocketTransportOnOutgoingCallback,
} from './WebSocketTransport'
import { kOnSend, kClose, WebSocketOverride } from './WebSocketOverride'

/**
 * Abstraction over the given mock `WebSocket` instance that allows
 * for controlling that instance (e.g. sending and receiving messages).
 */
export class WebSocketClassTransport extends WebSocketTransport {
  public onOutgoing: WebSocketTransportOnOutgoingCallback = () => {}
  public onIncoming: WebSocketTransportOnIncomingCallback = () => {}
  public onClose: WebSocketTransportOnCloseCallback = () => {}

  constructor(protected readonly socket: WebSocketOverride) {
    super()

    this.socket.addEventListener('close', (event) => this.onClose(event), {
      once: true,
    })
    this.socket[kOnSend] = (...args) => this.onOutgoing(...args)
  }

  public send(data: WebSocketData): void {
    queueMicrotask(() => {
      const message = bindEvent(
        /**
         * @note Setting this event's "target" to the
         * WebSocket override instance is important.
         * This way it can tell apart original incoming events
         * (must be forwarded to the transport) from the
         * mocked message events like the one below
         * (must be dispatched on the client instance).
         */
        this.socket,
        new MessageEvent('message', {
          data,
          origin: this.socket.url,
        })
      )

      this.socket.dispatchEvent(message)
    })
  }

  public close(code: number, reason?: string): void {
    /**
     * @note Call the internal close method directly
     * to allow closing the connection with the status codes
     * that are non-configurable by the user (> 1000 <= 1015).
     */
    this.socket[kClose](code, reason)
  }
}
