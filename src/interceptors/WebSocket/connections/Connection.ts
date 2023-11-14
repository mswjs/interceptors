import { invariant } from 'outvariant'
import type { Transport, WebSocketData } from '../transports/Transport'

export const kOnOutgoingMessage = Symbol('kOnOutgoingMessage')
export const kHandshakeState = Symbol('kHandshakeState')
const kEmitter = Symbol('kEmitter')

export interface ConnectionOptions<T extends Transport> {
  url: string
  transport: T
}

/**
 * Connection represents server-side connection to a particular
 * WebSocket client.
 */
export abstract class Connection<T extends Transport> {
  public url: string
  public isOpen: boolean

  protected transport: T
  private [kHandshakeState]: 'mock' | 'bypass'
  private [kEmitter]: EventTarget

  constructor(options: ConnectionOptions<T>) {
    this[kHandshakeState] = 'bypass'
    this[kEmitter] = new EventTarget()

    this.url = options.url
    this.transport = options.transport
    this.isOpen = false
  }

  public handshake(): void {
    this[kHandshakeState] = 'mock'

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
   * Emit event from the server to the client.
   */
  public emit(event: string, data: WebSocketData): void {
    invariant(false, `The "emit" method is not implemented on this Connection`)
  }

  /**
   * Close this WebSocket connection from the server.
   */
  public close(): void {
    if (!this.isOpen) {
      return
    }

    this.transport.close()
    this.isOpen = false
  }

  /**
   * Handle outgoing (intercepted) client messages.
   */
  [kOnOutgoingMessage](data: WebSocketData) {
    // Note that this "message" will be emitted on the connection itself
    // so the user could listen to outgoing client data like:
    //
    // connection.on('message', listener)
    this[kEmitter].dispatchEvent(new MessageEvent('message', { data }))
  }
}
