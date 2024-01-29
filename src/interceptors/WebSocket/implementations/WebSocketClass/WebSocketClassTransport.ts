import { bindEvent } from '../../utils/bindEvent'
import {
  WebSocketSendData,
  WebSocketTransport,
  WebSocketTransportOnIncomingCallback,
  WebSocketTransportOnOutgoingCallback,
} from '../../WebSocketTransport'
import { kOnSend, WebSocketClassOverride } from './WebSocketClassInterceptor'

export class WebSocketClassTransport extends WebSocketTransport {
  public onOutgoing: WebSocketTransportOnOutgoingCallback = () => {}
  public onIncoming: WebSocketTransportOnIncomingCallback = () => {}

  constructor(protected readonly ws: WebSocketClassOverride) {
    super()
    this.ws[kOnSend] = (...args) => this.onOutgoing(...args)
  }

  public send(data: WebSocketSendData): void {
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
        })
      )

      this.ws.dispatchEvent(message)
    })
  }

  public close(code: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
