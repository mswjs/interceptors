import { bindEvent } from './utils/bindEvent'
import {
  WebSocketRawData,
  WebSocketTransport,
  WebSocketTransportOnIncomingCallback,
  WebSocketTransportOnOutgoingCallback,
} from './WebSocketTransport'
import { kOnSend, WebSocketOverride } from './WebSocketOverride'

export class WebSocketClassTransport extends WebSocketTransport {
  public onOutgoing: WebSocketTransportOnOutgoingCallback = () => {}
  public onIncoming: WebSocketTransportOnIncomingCallback = () => {}

  constructor(protected readonly ws: WebSocketOverride) {
    super()
    this.ws[kOnSend] = (...args) => this.onOutgoing(...args)
  }

  public send(data: WebSocketRawData): void {
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
        this.ws,
        new MessageEvent('message', {
          data,
          origin: this.ws.url,
        })
      )

      this.ws.dispatchEvent(message)
    })
  }

  public close(code: number, reason?: string): void {
    /**
     * @note Call the internal close method directly
     * to allow closing the connection with the status codes
     * that are non-configurable by the user (> 1000 <= 1015).
     */
    this.ws['_close'](code, reason)
  }
}
