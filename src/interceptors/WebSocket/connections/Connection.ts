import { invariant } from 'outvariant'
import type { Transport, WebSocketData } from '../transports/Transport'

export const kOnOutgoingMessage = Symbol('kOnOutgoingMessage')

const kEmitter = Symbol('kEmitter')

export interface ConnectionOptions {
  url: string
  transport: Transport
}

/**
 * Connection represents server-side connection to a particular
 * WebSocket client.
 */
export abstract class Connection {
  public url: string
  public isOpen: boolean

  protected transport: Transport
  private [kEmitter]: EventTarget

  constructor(options: ConnectionOptions) {
    this[kEmitter] = new EventTarget()

    this.url = options.url
    this.transport = options.transport
    this.isOpen = false
  }

  public open(): void {
    if (this.isOpen) {
      return
    }

    this.transport.open()
    this.isOpen = true
  }

  public on(event: string, listener: (...data: Array<unknown>) => void): void {
    this[kEmitter].addEventListener(event, (event) => {
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
    if (!this.isOpen) {
      return
    }

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
    this[kEmitter].dispatchEvent(new MessageEvent('message', { data }))
  }
}
