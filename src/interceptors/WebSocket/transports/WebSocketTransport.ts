import { extendEvent } from '../utils/extendEvent'
import { Transport } from './Transport'

export class WebSocketTransport extends Transport {
  constructor(protected ws: WebSocket) {
    super()
  }

  public open(): void {
    queueMicrotask(() => {
      Reflect.set(this.ws, 'readyState', WebSocket.OPEN)

      const openEvent = new Event('open')
      extendEvent(openEvent, { target: this.ws })
      this.ws.dispatchEvent(openEvent)
    })
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
