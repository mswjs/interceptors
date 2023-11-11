import { invariant } from 'outvariant'
import type { Transport, WebSocketData } from '../transports/Transport'

export const kOnOutgoingMessage = Symbol('kOnOutgoingMessage')

/**
 * Connection represents server-side connection to a particular
 * WebSocket client.
 */
export abstract class Connection {
  private emitter: EventTarget

  constructor(protected readonly transport: Transport) {
    this.emitter = new EventTarget()
  }

  public open(): void {
    this.transport.open()
  }

  public on(event: string, listener: (...data: Array<unknown>) => void): void {
    this.emitter.addEventListener(event, (event) => {
      if (event instanceof MessageEvent) {
        listener(event.data)
      }
    })
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketData): void {
    this.transport.send(data)
  }

  /**
   * Emit event to the connected client.
   */
  public emit(event: string, data: WebSocketData): void {
    invariant(false, `The "emit" method is not implemented on this Connection`)
  }

  public close(): void {
    this.transport.close()
  }

  /**
   * Handle outgoing (intercepted) client messages.
   */
  [kOnOutgoingMessage](data: unknown) {
    // Note that this "message" will be emitted on the connection itself
    // so the user could listen to outgoing client data like:
    //
    // connection.on('message', listener)
    this.emitter.dispatchEvent(new MessageEvent('message', { data }))
  }
}
