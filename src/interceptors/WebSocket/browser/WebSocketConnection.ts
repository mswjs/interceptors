import { StrictEventEmitter } from 'strict-event-emitter'
import { createEvent } from '../utils/createEvent'
import type { WebSocketMessageData } from './WebSocketOverride'

export interface WebSocketConnectionEventsMap {
  [event: string]: (...data: any[]) => void
  message(event: MessageEvent<WebSocketMessageData>): void
  close(event: CloseEvent): void
}

export class WebSocketConnection {
  public readonly emitter: StrictEventEmitter<WebSocketConnectionEventsMap>

  constructor(public readonly client: WebSocket) {
    this.emitter = new StrictEventEmitter()
  }

  public emit<Event extends keyof WebSocketConnectionEventsMap>(
    event: Event,
    ...data: Parameters<WebSocketConnectionEventsMap[Event]>
  ): void {
    this.emitter.emit(event, ...data)
  }

  public on<Event extends keyof WebSocketConnectionEventsMap>(
    event: Event,
    listener: WebSocketConnectionEventsMap[Event]
  ): void {
    this.emitter.addListener(event, listener)
  }

  public send(data: WebSocketMessageData): void {
    this.client.dispatchEvent(
      createEvent(MessageEvent, 'message', {
        target: this.client,
        data,
      })
    )
  }

  public close(): void {
    this.emitter.removeAllListeners()
  }
}
