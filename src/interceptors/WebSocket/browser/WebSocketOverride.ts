import { StrictEventEmitter } from 'strict-event-emitter'
import type { Resolver, WebSocketEvent } from '../../../createInterceptor'
import { createEvent } from '../utils/createEvent'
import { getDataLength } from '../utils/getDataLength'
import { parseWebSocketProtocols } from '../utils/parseWebSocketProtocols'
import { parseWebSocketUrl } from '../utils/parseWebSocketUrl'
import { SocketIoConnection } from './SocketIoConnection'
import { WebSocketConnection } from './WebSocketConnection'

export type WebSocketMessageData =
  | ArrayBufferLike
  | ArrayBufferView
  | Blob
  | string

export interface WebSocketEventsMap {
  open(event: Event): void
  message(event: MessageEvent): void
  error(event: Event): void
  close(event: CloseEvent): void
}

function nextTick(callback: () => void): void {
  setTimeout(callback, 0)
}

export interface WebSocketOverrideArgs {
  resolver: Resolver<WebSocketEvent>
}

export function createWebSocketOverride({ resolver }: WebSocketOverrideArgs) {
  return class WebSocketOverride implements EventTarget, WebSocket {
    static readonly CONNECTING = WebSocket.CONNECTING
    static readonly OPEN = WebSocket.OPEN
    static readonly CLOSING = WebSocket.CLOSING
    static readonly CLOSED = WebSocket.CLOSED
    readonly CONNECTING = WebSocket.CONNECTING
    readonly OPEN = WebSocket.OPEN
    readonly CLOSING = WebSocket.CLOSING
    readonly CLOSED = WebSocket.CLOSED

    url: string
    protocol: string
    extensions: string
    readyState: number
    binaryType: BinaryType
    bufferedAmount: number

    emitter: StrictEventEmitter<WebSocketEventsMap>
    connection: WebSocketConnection

    constructor(url: string, protocols: string[] | string = []) {
      const parsedUrl = parseWebSocketUrl(url)
      const parsedProtocols = parseWebSocketProtocols(protocols)

      const useSocketIO = parsedUrl.pathname.startsWith('/socket.io/')

      this.url = url
      this.protocol = parsedProtocols[0] || parsedUrl.protocol
      this.extensions = ''
      this.readyState = this.CONNECTING
      this.binaryType = 'blob'
      this.bufferedAmount = 0

      this.emitter = new StrictEventEmitter()
      this.connection = useSocketIO
        ? new SocketIoConnection(this)
        : new WebSocketConnection(this)

      nextTick(() => {
        this.readyState = this.OPEN

        // Dispatch the "open" event.
        this.dispatchEvent(createEvent(Event, 'open', { target: this }))

        // Call the resolver to let it know about a new client connection.
        const resolverEvent: WebSocketEvent = {
          source: 'websocket',
          target: this,
          connection: this.connection,
          timeStamp: Date.now(),
          intercept() {},
        }
        resolver(resolverEvent)
      })
    }

    send(data: WebSocketMessageData): void {
      console.log('WebSocket.prototype.send:', data)

      if (this.readyState === this.CONNECTING) {
        this.close()
        throw new Error('InvalidStateError')
      }

      if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
        this.bufferedAmount += getDataLength(data)
        return
      }

      nextTick(() => {
        // Notify the "connection" about the outgoing client message.
        this.connection.emit('message', new MessageEvent('message', { data }))
      })
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

      nextTick(() => {
        this.readyState = this.CLOSED

        // Dispatch the "close" event.
        const closeEvent = createEvent(CloseEvent, 'close', {
          target: this,
          code,
          reason,
          wasClean: code === 1000,
        })

        this.dispatchEvent(closeEvent)

        // Notify the connection about the client closing.
        this.connection.emit('close', closeEvent)

        // Close the connection so it can no longer receive or send events.
        this.connection.close()

        // Remove all internal listeners.
        this.emitter.removeAllListeners()
      })
    }

    addEventListener<Event extends keyof WebSocketEventsMap>(
      event: Event,
      listener: WebSocketEventsMap[Event] | EventListenerObject | null
    ): void {
      if (!listener) {
        return
      }

      this.emitter.addListener(
        event,
        'handleEvent' in listener ? listener.handleEvent : listener
      )
    }

    removeEventListener<Event extends keyof WebSocketEventsMap>(
      event: Event,
      listener: WebSocketEventsMap[Event] | EventListenerObject | null
    ): void {
      if (!listener) {
        return
      }

      this.emitter.removeListener(
        event,
        'handleEvent' in listener ? listener.handleEvent : listener
      )
    }

    dispatchEvent(event: Event): boolean {
      return this.emitter.emit(event.type as keyof WebSocketEventsMap, event)
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
