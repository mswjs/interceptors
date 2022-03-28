import { StrictEventEmitter } from 'strict-event-emitter'
import type { Resolver, WebSocketEvent } from '../../../createInterceptor'
import { uuidv4 } from '../../../utils/uuid'
import { createEvent } from '../utils/createEvent'
import { getDataLength } from '../utils/getDataLength'
import { parseWebSocketProtocols } from '../utils/parseWebSocketProtocols'
import { parseWebSocketUrl } from '../utils/parseWebSocketUrl'

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

export interface WebSocketConnectionEventsMap {
  message(event: MessageEvent): void
  close(event: CloseEvent): void
}

function nextTick(callback: () => void): void {
  setTimeout(callback, 0)
}

enum EnginesIOParserPacketTypes {
  OPEN = '0',
  CLOSE = '1',
  PING = '2',
  PONG = '3',
  MESSAGE = '4',
  UPGRADE = '5',
  NOOP = '6',
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

      this.url = url
      this.protocol = parsedProtocols[0] || parsedUrl.protocol
      this.extensions = ''
      this.readyState = this.CONNECTING
      this.binaryType = 'blob'
      this.bufferedAmount = 0

      this.emitter = new StrictEventEmitter()
      this.connection = new WebSocketConnection(this)

      nextTick(() => {
        this.readyState = this.OPEN

        // Dispatch the "open" event.
        this.dispatchEvent(createEvent(Event, 'open', { target: this }))

        this.addEventListener('message', (event) => {
          console.log('outgoing message:', event.data)
        })

        if (parsedUrl.pathname.startsWith('/socket.io/')) {
          this.mockSocketIOConnection()
        }
      })
    }

    /**
     * @todo Abstract this away from socket.io.
     * - Will this work for regular WebSocket connections?
     * - This should definitely be ignored in the "connection" events.
     * This is an internal event.
     */
    mockSocketIOConnection(): void {
      const sid = uuidv4()
      const pingInterval = 25000

      // First, emulate that this client has received the "OPEN" event from the server.
      // This lets "socket.io-client" know that the server connection is established.
      this.emitter.emit(
        'message',
        createEvent(MessageEvent, 'message', {
          data:
            // "0" is a specific code parsed by "engine.io-parser" as "CONNECT".
            // When "socket.io-client" receives this code, it will emit a reserved
            // "connect" event, marking the socket as "connected".
            EnginesIOParserPacketTypes.OPEN +
            JSON.stringify({
              sid,
              upgrades: [],
              pingInterval,
              pingTimeout: 60000,
            }),
          target: this,
        })
      )

      // Next, emulate that the server has confirmed a new client.
      this.emitter.emit(
        'message',
        createEvent(MessageEvent, 'message', {
          data:
            EnginesIOParserPacketTypes.MESSAGE +
            EnginesIOParserPacketTypes.OPEN +
            JSON.stringify({
              sid,
            }),
        })
      )

      // Then, emulate the client receiving the "PING" event from the server,
      // which keeps the connection alive.
      const pingTimer = setInterval(() => {
        this.emitter.emit(
          'message',
          createEvent(MessageEvent, 'message', {
            /**
             * node_modules/engine.io-parser/build/esm/commons.js
             */
            data: EnginesIOParserPacketTypes.PING,
            target: this,
          })
        )
      }, pingInterval)

      const clearTimer = () => {
        clearInterval(pingTimer)
      }

      this.addEventListener('close', clearTimer)
      this.addEventListener('error', clearTimer)

      /**
       * @todo Handle socket.io special message data format
       * when calling ".send" and ".emit".
       */
    }

    send(data: WebSocketMessageData): void {
      console.warn('mock.send:', data)

      if (this.readyState === this.CONNECTING) {
        this.close()
        throw new Error('InvalidStateError')
      }

      if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
        this.bufferedAmount += getDataLength(data)
        return
      }

      // Notify the connection about the outgoing client message.
      nextTick(() => {
        const messageEvent = new MessageEvent('message', { data })
        this.connection.emit('message', messageEvent)
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

        // Terminate the connection so it can no longer receive or send events.
        this.connection.terminate()

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
