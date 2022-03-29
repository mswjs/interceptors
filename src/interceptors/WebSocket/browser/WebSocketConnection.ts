import { StrictEventEmitter } from 'strict-event-emitter'
import type {
  WebSocketEventsMap,
  WebSocketMessageData,
} from './WebSocketOverride'

export interface WebSocketConnectionEventsMap {
  message(event: MessageEvent<WebSocketMessageData>): void
  close(event: CloseEvent): void
}

export class WebSocketConnection {
  public readonly emitter: StrictEventEmitter<WebSocketConnectionEventsMap>

  constructor(
    public readonly client: WebSocket & {
      emitter: StrictEventEmitter<WebSocketEventsMap>
    }
  ) {
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
    const messageEvent = new MessageEvent('message', { data })
    this.client.emitter.emit('message', messageEvent)
  }

  public close(): void {
    this.emitter.removeAllListeners()
  }
}
