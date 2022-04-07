import { StrictEventEmitter } from 'strict-event-emitter'
import { WebSocketEventMap } from '../../glossary'
import { createEvent } from '../../utils/createEvent'
import { nextTick } from '../../utils/nextTick'
import { SocketIoConnection } from './SocketIoConnection'
import { getDataLength } from './utils/getDataLength'
import { parseWebSocketProtocols } from './utils/parseWebSocketProtocols'
import { parseWebSocketUrl } from './utils/parseWebSocketUrl'
import { WebSocketConnection } from './WebSocketConnection'

export type WebSocketMessageData =
  | ArrayBufferLike
  | ArrayBufferView
  | Blob
  | string

export interface WebSocketOverrideEventMap {
  open(event: Event): void
  message(event: MessageEvent): void
  error(event: Event): void
  close(event: CloseEvent): void
}

export interface WebSoketOverrideInstance extends WebSocket {
  emitter: StrictEventEmitter<WebSocketOverrideEventMap>
  connection: WebSocketConnection
}

export interface WebSocketOverrideArgs {
  WebSocket: typeof window.WebSocket
  emitter: StrictEventEmitter<WebSocketEventMap>
}

export function createWebSocketOverride({
  WebSocket,
  emitter,
}: WebSocketOverrideArgs) {
  return class WebSocketOverride
    implements EventTarget, WebSocket, WebSoketOverrideInstance
  {
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

    ws: WebSocket
    emitter: StrictEventEmitter<WebSocketOverrideEventMap>
    connection: WebSocketConnection

    constructor(url: string, protocols: string[] | string = []) {
      const parsedUrl = parseWebSocketUrl(url)
      const parsedProtocols = parseWebSocketProtocols(protocols)

      const useSocketIo = parsedUrl.pathname.startsWith('/socket.io/')

      this.url = url
      this.protocol = parsedProtocols[0] || parsedUrl.protocol
      this.extensions = ''
      this.readyState = this.CONNECTING
      this.binaryType = 'blob'
      this.bufferedAmount = 0

      this.emitter = new StrictEventEmitter()
      this.connection = useSocketIo
        ? new SocketIoConnection(this)
        : new WebSocketConnection(this)

      // Create an original WebSocket connection
      // so that we can proxy the incoming server events
      // to the mocked WebSocket instance.
      this.ws = new WebSocket(url, protocols)
      this.ws.addEventListener('message', this.dispatchEvent.bind(this))

      nextTick(() => {
        this.readyState = this.OPEN

        // Dispatch the "open" event.
        this.dispatchEvent(createEvent(Event, 'open', { target: this }))

        // Emit a public "connection" event of the interceptor.
        emitter.emit('connection', this.connection)
      })
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

      nextTick(() => {
        // Notify the "connection" about the outgoing client message.
        this.connection['handleOutgoingMessage'](
          createEvent(MessageEvent, 'message', {
            target: this,
            data,
          })
        )

        // Proxy the message to the original WebSocket connection.
        this.ws.send(data)
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

        // Remove all internal listeners.
        this.emitter.removeAllListeners()

        // Close the original WebSocket connection.
        if (
          this.ws.readyState !== this.CLOSING &&
          this.ws.readyState !== this.CLOSED
        ) {
          this.ws.close(code, reason)
        }
      })
    }

    addEventListener<Event extends keyof WebSocketOverrideEventMap>(
      event: Event,
      listener: WebSocketOverrideEventMap[Event] | EventListenerObject | null
    ): void {
      if (!listener) {
        return
      }

      this.emitter.addListener(
        event,
        'handleEvent' in listener ? listener.handleEvent : listener
      )
    }

    removeEventListener<Event extends keyof WebSocketOverrideEventMap>(
      event: Event,
      listener: WebSocketOverrideEventMap[Event] | EventListenerObject | null
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
      return this.emitter.emit(
        event.type as keyof WebSocketOverrideEventMap,
        event
      )
    }

    set onopen(listener: WebSocketOverrideEventMap['open']) {
      this.emitter.addListener('open', listener)
    }

    set onmessage(listener: WebSocketOverrideEventMap['message']) {
      this.emitter.addListener('message', listener)
    }

    set onclose(listener: WebSocketOverrideEventMap['close']) {
      this.emitter.addListener('close', listener)
    }

    set onerror(listener: WebSocketOverrideEventMap['error']) {
      this.emitter.addListener('error', listener)
    }
  }
}
