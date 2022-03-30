import { invariant } from 'outvariant'
import { StrictEventEmitter } from 'strict-event-emitter'
import { createEvent } from '../utils/createEvent'
import type {
  WebSoketOverrideInstance,
  WebSocketMessageData,
} from './WebSocketOverride'

export type WebSocketConnectionEventsMap = {
  [event: string]: (...data: unknown[]) => void
}

export interface WebSocketConnectionReservedEventsMap {
  message(event: MessageEvent<WebSocketMessageData>): void
}

export class WebSocketConnection {
  protected readonly emitter: StrictEventEmitter<WebSocketConnectionEventsMap>
  protected readonly reservedEmitter: StrictEventEmitter<WebSocketConnectionReservedEventsMap>

  constructor(protected readonly socket: WebSoketOverrideInstance) {
    this.emitter = new StrictEventEmitter()
    this.reservedEmitter = new StrictEventEmitter()

    this.socket.addEventListener('close', (event) => {
      this.emit('close', event)

      // Close this connection once the underlying socket closes.
      this.close()
    })

    this.reservedEmitter.on('message', (event) => {
      this.handleOutgoingMessage(event)
    })
  }

  protected handleOutgoingMessage(
    event: MessageEvent<WebSocketMessageData>
  ): void {
    /**
     * The default connection routes all socket message events
     * to the connection emitter as-is.
     *
     * @example
     * // Intercepted events can be listened to:
     * connection.on('message', (event) => {})
     */
    this.emitter.emit('message', event)
  }

  /**
   * Emit event to the connected client.
   */
  public emit(event: string, ...data: unknown[]): void {
    // While frameworks like "socket.io" allow emitting arbitrary events
    // (which they then coerce to the "message" event anyway), regular WebSocket instance
    // does not support any events but "open", "close" (internal) and "message" (public).
    invariant(
      event === 'message',
      'Failed to emit WebSocket event: unknown event "%s". The native WebSocket implementation only supports the "message" event.',
      event
    )

    this.socket.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.socket,
        data,
      })
    )
  }

  private emitReserved<
    ReservedEvent extends keyof WebSocketConnectionReservedEventsMap
  >(
    event: ReservedEvent,
    ...data: Parameters<WebSocketConnectionReservedEventsMap[ReservedEvent]>
  ): void {
    this.reservedEmitter.emit(event, ...data)
  }

  /**
   * Subscribe to client-side events.
   */
  public on<Event extends keyof WebSocketConnectionEventsMap>(
    event: Event,
    listener: WebSocketConnectionEventsMap[Event]
  ): void {
    this.emitter.addListener(event, listener)
  }

  /**
   * Send data to the connected client.
   */
  public send(data: WebSocketMessageData): void {
    this.socket.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.socket,
        data,
      })
    )
  }

  /**
   * Close the active connection.
   */
  protected close(): void {
    this.emitter.removeAllListeners()
    this.reservedEmitter.removeAllListeners()
  }
}
