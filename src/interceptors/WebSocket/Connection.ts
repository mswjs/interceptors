import { Debugger, debug } from 'debug'
import { invariant } from 'outvariant'
import { EventMapType, StrictEventEmitter } from 'strict-event-emitter'
import { Transport } from './transports/WebSocketTransport'
import { WebSocketMessageData } from './WebSocketOverride'

export interface ConnectionOptions {
  name: string
  transport: Transport
}

/**
 * Abstract class for the user-facing "connection" instance.
 * This is the instance you get in the "connection" callback.
 * @example
 * interceptor.on('connection', (socket) => {
 *  socket.on('message', listener)
 * })
 */
export abstract class Connection {
  protected log: Debugger
  protected readonly emitter: StrictEventEmitter<EventMapType>
  protected readonly transport: Transport

  constructor(options: ConnectionOptions) {
    this.log = debug('connection').extend(options.name)

    this.emitter = new StrictEventEmitter()
    this.transport = options.transport
  }

  protected onOpen(): void {
    const log = this.log.extend('onOpen')
    log('opening a new connection...')

    this.transport.open()
  }

  protected onMessage(event: MessageEvent<WebSocketMessageData>): void {
    const log = this.log.extend('onMessage')
    log(event.type, event.data)

    // Whenever a WebSocket instance invokes the ".send()" method,
    // this will trigger "Connection.onMessage". Propagate sent client-side messages
    // to the connection instance so the user may listen to them.
    this.emitter.emit('message', event.data)
  }

  public on(event: string, listener: (...data: unknown[]) => void): void {
    const log = this.log.extend('on')
    log('adding "%s" listener:', event, listener.name, new Error().stack)

    this.emitter.addListener(event, listener)
  }

  public send(data: WebSocketMessageData): void {
    const log = this.log.extend('send')
    log('sending data (default):', data)

    this.transport.send(data)
  }

  public emit(event: string, ...data: unknown[]): void {
    invariant(false, 'The "emit" method is not implemented on this connection.')
  }

  protected close(): void {
    this.emitter.removeAllListeners()
    this.transport.dispose()
  }
}
