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

  public close(code: number, reason?: string): void {
    if (!code || !(code === 1000 || (code > 3000 && code < 5000))) {
      throw new Error(
        'InvalidAccessError: close code out of user configurable range'
      )
    }

    if (
      this.ws.readyState === WebSocket.CLOSING ||
      this.ws.readyState === WebSocket.CLOSED
    ) {
      return
    }

    Reflect.set(this.ws, 'readyState', WebSocket.CLOSING)

    queueMicrotask(() => {
      const closeEvent = new CloseEvent('close')
      extendEvent(closeEvent, {
        target: this.ws,
        code,
        reason,
        wasClean: code === 1000,
      })

      /**
       * @fixme This won't trigger the client-side
       * "onclose" listeners because they are suppressed
       * to prevent initial connection close.
       */
      this.ws.dispatchEvent(closeEvent)
    })
  }
}
