import { bindEvent } from '../../utils/bindEvent'
import {
  WebSocketSendData,
  WebSocketTransport,
  WebSocketTransportOnIncomingCallback,
  WebSocketTransportOnOutgoingCallback,
} from '../../WebSocketTransport'
import {
  kOnReceive,
  kOnSend,
  WebSocketClassOverride,
} from './WebSocketClassInterceptor'

export class WebSocketClassTransport extends WebSocketTransport {
  public onOutgoing: WebSocketTransportOnOutgoingCallback = () => {}
  public onIncoming: WebSocketTransportOnIncomingCallback = () => {}

  constructor(protected readonly ws: WebSocketClassOverride) {
    super()

    this.ws[kOnSend] = (...args) => this.onOutgoing(...args)
    this.ws[kOnReceive] = (...args) => this.onIncoming(...args)
  }

  public send(data: WebSocketSendData): void {
    queueMicrotask(() => {
      console.log(
        'WebSocketClassTransport#send',
        data,
        this.ws,
        this.ws.readyState
      )

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

      console.log('message', message, message.target)

      this.ws.dispatchEvent(message)
    })
  }

  public close(code: number, reason?: string): void {
    this.ws.close(code, reason)
  }
}
