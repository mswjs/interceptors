import { invariant } from 'outvariant'
import { Connection } from './Connection'
import { WebSocketTransport } from './transports/WebSocketTransport'

export class WebSocketConnection extends Connection {
  constructor(protected readonly socket: WebSocket) {
    super({
      transport: new WebSocketTransport(socket),
    })
  }

  public emit(event: string, ...data: any): void {
    invariant(
      event === 'message',
      'Failed to emit unknown WebSocket "%s" event. The native WebSocket implementation only supports the "message" event.',
      event
    )

    this.transport.send(data)
  }
}

// export class WebSocketConnection {
//   protected readonly emitter: StrictEventEmitter<WebSocketConnectionEventsMap>

//   constructor(protected readonly options: WebSocketConnectionOptions) {
//     this.emitter = new StrictEventEmitter()
//   }

//   protected handleOutgoingMessage(
//     event: MessageEvent<WebSocketMessageData>
//   ): void {
//     /**
//      * The default connection routes all socket message events
//      * to the connection emitter as-is.
//      *
//      * @example
//      * // Intercepted events can be listened to:
//      * connection.on('message', (event) => {})
//      */
//     this.emitter.emit('message', event)
//   }

//   /**
//    * Emit event to the connected client.
//    */
//   public emit(event: string, ...data: unknown[]): void {
//     // While frameworks like "socket.io" allow emitting arbitrary events
//     // (which they then coerce to the "message" event anyway), regular WebSocket instance
//     // does not support any events but "open", "close" (internal) and "message" (public).
//     invariant(
//       event === 'message',
//       'Failed to emit WebSocket event: unknown event "%s". The native WebSocket implementation only supports the "message" event.',
//       event
//     )

//     this.options.onEmit(event)

//     // this.socket.dispatchEvent(
//     //   createEvent(MessageEvent, 'message', {
//     //     target: this.socket,
//     //     data,
//     //   })
//     // )
//   }

//   /**
//    * Subscribe to client-side events.
//    */
//   public on<Event extends keyof WebSocketConnectionEventsMap>(
//     event: Event,
//     listener: WebSocketConnectionEventsMap[Event]
//   ): void {
//     this.emitter.addListener(event, listener)
//   }

//   /**
//    * Send data to the connected client.
//    */
//   public send(data: WebSocketMessageData): void {
//     // this.socket.dispatchEvent(
//     //   createEvent(MessageEvent, 'message', {
//     //     target: this.socket,
//     //     data,
//     //   })
//     // )
//   }

//   /**
//    * Close the active connection.
//    */
//   protected close(): void {
//     this.emitter.removeAllListeners()
//   }
// }
