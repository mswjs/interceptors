import { WebSocketMessageData } from '../WebSocketOverride'
import { createEvent } from '../../../utils/createEvent'
import { Disposable } from '../../../utils/Disposable'

export abstract class Transport extends Disposable {
  public open(): void {}

  /**
   * Send WebSocket data using the underlying transport.
   */
  public send(data: WebSocketMessageData): void {}
}

export class WebSocketTransport extends Transport {
  constructor(protected readonly socket: WebSocket) {
    super()
  }

  public send(data: WebSocketMessageData): void {
    this.socket.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.socket,
        data,
      })
    )
  }
}
