import { invariant } from 'outvariant'
import { EventMapType, StrictEventEmitter } from 'strict-event-emitter'
import { Transport } from './transports/WebSocketTransport'
import { WebSocketMessageData } from './WebSocketOverride'

export interface ConnectionOptions {
  transport: Transport
}

/**
 * Abstract class for the user-facing "connection" instance.
 * This is the instance you get in the "connection" callback.
 * @example
 * interceptor.on('connection', (socket) => {
 *  socket.on('message', listener)
 * })
 *
 */
export abstract class Connection {
  protected readonly emitter: StrictEventEmitter<EventMapType>
  protected readonly transport: Transport

  constructor(options: ConnectionOptions) {
    this.emitter = new StrictEventEmitter()
    this.transport = options.transport
  }

  public on(event: string, listener: (...data: unknown[]) => void): void {
    this.emitter.addListener(event, listener)
  }

  public send(data: WebSocketMessageData): void {
    this.transport.send(data)
  }

  public emit(event: string, ...data: unknown[]): void {
    invariant(false, 'The "emit" method is not implemented on this connection.')
  }

  protected onOpen(): void {
    this.transport.open()
  }

  protected onMessage(event: MessageEvent<WebSocketMessageData>): void {
    // Whenever a WebSocket instance invokes the ".send()" method,
    // this will trigger "Connection.onMessage". Propagate sent client-side messages
    // to the connection instance so the user may listen to them.
    this.emitter.emit('message', event.data)
  }

  protected close(): void {
    console.log('CONNECTION CLOSED!')
    this.emitter.removeAllListeners()
  }
}
