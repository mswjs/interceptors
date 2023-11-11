import { extendEvent } from '../utils/extendEvent'
import { Transport } from './Transport'

export class WebSocketTransport extends Transport {
  constructor(protected ws: WebSocket) {
    super()
  }

  /**
   * Send data from the server to the client.
   */
  public send(data: unknown) {
    const event = new MessageEvent('message', { data })
    extendEvent(event, { target: this.ws })

    this.ws.dispatchEvent(event)
  }
}
