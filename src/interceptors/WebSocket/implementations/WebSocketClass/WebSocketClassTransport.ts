import { bindEvent } from '../../utils/bindEvent'
import {
  WebSocketSendData,
  WebSocketTransport,
  WebSocketTransportOnIncomingCallback,
} from '../../WebSocketTransport'
import { kOnReceive, WebSocketClassOverride } from './WebSocketClassInterceptor'

export class WebSocketClassTransport extends WebSocketTransport {
  public onIncoming: WebSocketTransportOnIncomingCallback = () => {}

  constructor(protected readonly ws: WebSocketClassOverride) {
    super()
    this.ws[kOnReceive] = this.onIncoming
  }

  public send(data: WebSocketSendData): void {
    this.ws.dispatchEvent(
      bindEvent(
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
    )
  }

  public close(code: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
