import { invariant } from 'outvariant'
import { StrictEventEmitter } from 'strict-event-emitter'
import type { Resolver, WebSocketEvent } from '../../../createInterceptor'
import { getDataLength } from '../utils/getDataLength'

export type WebSocketMessageData =
  | ArrayBufferLike
  | ArrayBufferView
  | Blob
  | string

interface WebSocketEventsMap {
  open(event: Event): void
  message(event: MessageEvent): void
  error(event: Event): void
  close(event: CloseEvent): void
}

export interface WebSocketConnectionEventsMap {
  message(event: MessageEvent): void
  close(event: CloseEvent): void
}

export class WebSocketConnection {
  private emitter: StrictEventEmitter<WebSocketConnectionEventsMap>

  constructor(public readonly client: WebSocket) {
    this.emitter = new StrictEventEmitter()
  }

  emit<Event extends keyof WebSocketConnectionEventsMap>(
    event: Event,
    ...data: Parameters<WebSocketConnectionEventsMap[Event]>
  ): void {
    this.emitter.emit(event, ...data)
  }

  on<Event extends keyof WebSocketConnectionEventsMap>(
    event: Event,
    listener: WebSocketConnectionEventsMap[Event]
  ): void {
    this.emitter.addListener(event, listener)
  }

  send(data: WebSocketMessageData): void {
    const messageEvent = new MessageEvent('message', { data })
    // @ts-ignore
    this.client.emitter.emit('message', messageEvent)
  }

  terminate(): void {
    this.emitter.removeAllListeners()
  }
}

export function createWebSocketOverride(resolver: Resolver<WebSocketEvent>) {
  return class WebSocketOverride implements WebSocket {
    static readonly CONNECTING = WebSocket.CONNECTING
    static readonly OPEN = WebSocket.OPEN
    static readonly CLOSING = WebSocket.CLOSING
    static readonly CLOSED = WebSocket.CLOSED
    readonly CONNECTING = WebSocket.CONNECTING
    readonly OPEN = WebSocket.OPEN
    readonly CLOSING = WebSocket.CLOSING
    readonly CLOSED = WebSocket.CLOSED

    url: string
    protocol: string = ''
    extensions: string = ''
    readyState: number = WebSocket.CONNECTING
    binaryType: BinaryType = 'blob'
    bufferedAmount: number = 0

    emitter: StrictEventEmitter<WebSocketEventsMap>
    connection: WebSocketConnection

    constructor(url: string, protocols: string[] | string = []) {
      const parsedUrl = new URL(url)
      this.validateUrl(parsedUrl)

      this.url = url
      this.protocol = protocols[0] || parsedUrl.protocol
      this.emitter = new StrictEventEmitter()
      this.connection = new WebSocketConnection(this)

      setTimeout(() => {
        this.readyState = this.OPEN

        // Call the resolver immediately when a client connects
        // and only do so once. The resolver in the context of WebSocket
        // interception represents a "connection" callback.
        const resolverEvent: WebSocketEvent = {
          source: 'websocket',
          target: this,
          connection: this.connection,
          timeStamp: Date.now(),
        }
        resolver(resolverEvent)

        // Dispatch the "open" event.
        const openEvent = new Event('open')
        Object.defineProperty(openEvent, 'target', {
          value: this,
          enumerable: true,
          writable: false,
        })
        this.dispatchEvent(openEvent)
      }, 0)
    }

    send(data: WebSocketMessageData): void {
      if (this.readyState === this.CONNECTING) {
        this.close()
        throw new Error('InvalidStateError')
      }

      if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
        this.bufferedAmount += getDataLength(data)
        return
      }

      // Notify the connection about the outgoing client message.
      const messageEvent = new MessageEvent('message', { data })
      this.connection.emit('message', messageEvent)
    }

    close(code: number = 1000, reason?: string): void {
      if (!code || !(code === 1000 || (code >= 3000 && code < 5000))) {
        throw new Error(
          'InvalidAccessError: close code out of user configurable range'
        )
      }

      if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
        return
      }

      this.readyState = this.CLOSING

      setTimeout(() => {
        this.readyState = this.CLOSED

        // Dispatch the "close" event.
        const closeEvent = new CloseEvent('close', {
          code,
          reason,
          wasClean: code === 1000,
        })
        Object.defineProperty(closeEvent, 'target', {
          value: this,
          enumerable: true,
          writable: false,
        })
        this.dispatchEvent(closeEvent)

        // Notify the connection about the client closing.
        this.connection.emit('close', closeEvent)

        // Terminate the connection so it can no longer receive or send events.
        this.connection.terminate()
      }, 0)
    }

    addEventListener<Event extends keyof WebSocketEventsMap>(
      event: Event,
      listener: WebSocketEventsMap[Event]
    ): void {
      this.emitter.addListener(event, listener)
    }

    removeEventListener<Event extends keyof WebSocketEventsMap>(
      event: Event,
      listener: WebSocketEventsMap[Event]
    ): void {
      this.emitter.removeListener(event, listener)
    }

    dispatchEvent(event: Event): boolean {
      return this.emitter.emit(event.type as keyof WebSocketEventsMap, event)
    }

    validateUrl(url: URL): void {
      // Forbid invalid WebSocket protocols.
      invariant(
        url.protocol === 'wss:' || url.protocol === 'ws:',
        `SyntaxError: Failed to construct 'WebSocket': The URL's scheme must be either 'ws' or 'wss'. '%s' is not allowed.`,
        url.protocol
      )

      // Forbid fragments (hashes) in the WebSocket URL.
      invariant(
        !url.hash,
        `SyntaxError: Failed to construct 'WebSocket': The URL contains a fragment identifier (%s). Fragment identifiers are not allowed in WebSocket URLs.`,
        url.hash
      )
    }

    set onopen(listener: WebSocketEventsMap['open']) {
      this.emitter.addListener('open', listener)
    }

    set onmessage(listener: WebSocketEventsMap['message']) {
      this.emitter.addListener('message', listener)
    }

    set onclose(listener: WebSocketEventsMap['close']) {
      this.emitter.addListener('close', listener)
    }

    set onerror(listener: WebSocketEventsMap['error']) {
      this.emitter.addListener('error', listener)
    }
  }
}
