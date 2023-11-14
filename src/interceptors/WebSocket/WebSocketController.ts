import { invariant } from 'outvariant'
import { Emitter } from 'strict-event-emitter'
import { kHandshakeState, kOnOutgoingMessage } from './connections/Connection'
import { WebSocketConnection } from './connections/WebSocketConnection'
import type { WebSocketData } from './transports/Transport'
import { extendEvent } from './utils/extendEvent'
import { emitAsync } from '../../utils/emitAsync'
import type { WebSocketInterceptorEventMap } from '.'
import { NextFunction, createProxy } from '../../utils/createProxy'

interface WebSocketControllerOptions {
  url: URL | string
  protocols?: string | Array<string>
  emitter: Emitter<WebSocketInterceptorEventMap>
  WebSocketClass: typeof WebSocket
}

export class WebSocketController {
  public ws: WebSocket | WebSocketOverride
  public connection: WebSocketConnection

  constructor(protected options: WebSocketControllerOptions) {
    // By default, construct a WebSocket override class to prevent
    // the connection errors that cannot be try/catch'ed.
    // If the user decides to mock this connection,
    // they will continue interacting with the override instance
    // that implements the WebSocket browser class faithfully.
    this.ws = new WebSocketOverride(options.url, options.protocols)

    // Connection is the bridge between whatever internals are
    // happening in the interceptor and the user, who operates
    // on the connection to send/listen to the client-side events.
    this.connection = new WebSocketConnection(this.ws)

    // Wait for all the "connection" listeners to be called before continuing.
    emitAsync(options.emitter, 'connection', this.connection).then(() => {
      // By this time, the consumer has already decided whether to mock
      // this connection or not, so either continue using the override class
      // or re-construct the WebSocket connection using the original arguments.
      if (this.connection[kHandshakeState] === 'bypass') {
        if ('unwrap' in this.ws) {
          this.ws = this.ws.unwrap(options.WebSocketClass)
        }
      }

      /**
       * @todo Proxy whichever WebSocket target is right.
       * This will spy on the send/receive events and tunnel them
       * through the "connection" before forwarding them to the socket instance.
       */
      this.ws = createWebSocketProxy(this.ws, {
        onSend: (data, next) => {
          this.connection[kOnOutgoingMessage](data)
        },
        onReceived: (data, next) => {
          throw new Error('Incoming messages not implemented')
        },
      })
    })

    /**
     * @todo Is this proxy really necessary?
     */
    // this.ws = createProxy(this.ws, {
    //   methodCall: ([methodName, args], next) => {
    //     switch (methodName) {
    //       case 'send': {
    //         return this.send(args[0] as WebSocketData)
    //       }

    //       case 'addEventListener': {
    //         const [event, listener] = args as [
    //           string,
    //           EventListenerOrEventListenerObject
    //         ]

    //         // Suppress the original "error" and "close" events
    //         // from propagating to the user-attached listeners.
    //         // The user will be in charge of those events via
    //         // the connection received in the handler.
    //         if (['error', 'close'].includes(event)) {
    //           /**
    //            * @fixme Somehow still call these listeners
    //            * if the connection was closed in the handler. The same for errors.
    //            */
    //           return
    //         }

    //         return next()
    //       }

    //       default: {
    //         return next()
    //       }
    //     }
    //   },

    //   setProperty: ([propertyName, nextValue], next) => {
    //     switch (propertyName) {
    //       case 'onopen':
    //       case 'onmessage':
    //       case 'onclose':
    //       case 'onerror': {
    //         const eventName = propertyName.replace(/^on/, '')
    //         this.ws.addEventListener(
    //           eventName,
    //           nextValue as EventListenerOrEventListenerObject
    //         )
    //         return true
    //       }

    //       default: {
    //         return next()
    //       }
    //     }
    //   },
    // })
  }

  // private send(data: WebSocketData): void {
  //   if (
  //     this.ws.readyState === WebSocket.CLOSING ||
  //     this.ws.readyState === WebSocket.CLOSED
  //   ) {
  //     /**
  //      * @todo Calculate the buffer amount.
  //      */
  //     Reflect.set(this.ws, 'bufferAmount', this.ws.bufferedAmount + 0)
  //     return
  //   }

  //   queueMicrotask(() => {
  //     // Notify the "connection" object so the user could
  //     // react to the outgoing (client) data in the handler.
  //     this.connection[kOnOutgoingMessage](data)
  //   })
  // }
}

function createWebSocketProxy(
  ws: WebSocket,
  options: {
    onSend: (data: WebSocketData, next: NextFunction<void>) => void
    onReceived: (data: WebSocketData, next: NextFunction<void>) => void
  }
): WebSocket {
  const proxy = createProxy(ws, {
    methodCall([methodName, args], next) {
      switch (methodName) {
        case 'send': {
          options.onSend(args[0], next)
          break
        }

        case 'dispatchEvent': {
          const [event] = args

          if (event instanceof MessageEvent && event.type === 'message') {
            options.onReceived(event.data, next)
            return
          }

          return next()
        }

        default: {
          return next()
        }
      }
    },
  })

  return proxy
}

class WebSocketOverride extends EventTarget implements WebSocket {
  static readonly CONNECTING = WebSocket.CONNECTING
  static readonly OPEN = WebSocket.OPEN
  static readonly CLOSING = WebSocket.CLOSING
  static readonly CLOSED = WebSocket.CLOSED
  readonly CONNECTING = WebSocket.CONNECTING
  readonly OPEN = WebSocket.OPEN
  readonly CLOSING = WebSocket.CLOSING
  readonly CLOSED = WebSocket.CLOSED

  public url: string
  public protocol: string
  public extensions: string
  public bufferedAmount: number
  public binaryType: BinaryType
  public readyState: number

  private _url: string | URL
  private _protocols?: string | Array<string>
  private _events: Map<string, Set<EventListenerOrEventListenerObject>>
  private _onopen: ((this: WebSocket, event: Event) => void) | null = null
  private _onmessage: ((this: WebSocket, event: MessageEvent) => void) | null =
    null
  private _onclose: ((this: WebSocket, event: CloseEvent) => void) | null = null
  private _onerror: ((this: WebSocket, event: Event) => void) | null = null

  constructor(url: URL | string, protocols?: string | Array<string>) {
    super()

    this._url = url
    this._protocols = protocols
    this._events = new Map()

    this.url = url.toString()
    this.protocol = protocols ? protocols[0] : 'ws'
    this.extensions = ''
    this.bufferedAmount = 0
    this.binaryType = 'arraybuffer'

    this.readyState = this.CONNECTING
  }

  public unwrap(WebSocketClass: typeof WebSocket): WebSocket {
    const ws = new WebSocketClass(this._url, this._protocols)

    // Forward any event listeners added to the override
    // to the original WebSocket instance.
    this._events.forEach((listeners, event) => {
      listeners.forEach((listener) => {
        ws.addEventListener(event, listener)
      })
    })

    return ws
  }

  public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState === this.CONNECTING) {
      this.close()
      throw new Error('InvalidStateError')
    }

    if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
      this.bufferedAmount += getDataSize(data)

      /**
       * @todo Should actually buffer the data and send it all
       * once the socket becomes connected.
       */
      return
    }

    /**
     * @todo
     */
  }

  public close(code?: number | undefined, reason?: string | undefined): void {
    const CODE_RANGE_ERROR =
      'InvalidAccessError: close code out of user configurable range'

    invariant(code, CODE_RANGE_ERROR)
    invariant(code === 1000 || (code >= 3000 && code < 5000), CODE_RANGE_ERROR)

    if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
      return
    }

    const closeEvent = new Event('close')
    extendEvent(closeEvent, {
      target: this,
      code,
      reason,
      wasClean: code === 1000,
    })
    this.dispatchEvent(closeEvent)

    // Remove all listeners.
    this._onopen = null
    this._onmessage = null
    this._onerror = null
    this._onclose = null
  }

  public addEventListener<WebSocketEvent extends keyof WebSocketEventMap>(
    type: WebSocketEvent,
    listener:
      | ((this: WebSocket, event: WebSocketEventMap[WebSocketEvent]) => void)
      | null,
    options?: boolean | AddEventListenerOptions
  ): void
  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  public addEventListener<WebSocketEvent extends keyof WebSocketEventMap>(
    type: WebSocketEvent | string,
    listener:
      | ((this: WebSocket, event: WebSocketEventMap[WebSocketEvent]) => void)
      | EventListenerOrEventListenerObject
      | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (listener !== null) {
      this._events.set(
        type,
        (this._events.get(type) || new Set()).add(listener)
      )
    }

    return super.addEventListener(type, listener, options)
  }

  set onopen(listener: ((this: WebSocket, event: Event) => void) | null) {
    this.removeEventListener('open', this._onopen)
    this._onopen = listener
    this.addEventListener('open', this._onopen)
  }

  set onmessage(
    listener: ((this: WebSocket, event: MessageEvent) => void) | null
  ) {
    this.removeEventListener('message', this._onmessage)
    this._onmessage = listener
    this.addEventListener('message', this._onmessage)
  }

  set onclose(listener: ((this: WebSocket, event: CloseEvent) => void) | null) {
    this.removeEventListener('message', this._onclose)
    this._onclose = listener
    this.addEventListener('close', this._onclose)
  }

  set onerror(listener: ((this: WebSocket, event: Event) => void) | null) {
    this.removeEventListener('error', this._onerror)
    this._onerror = listener
    this.addEventListener('error', this._onerror)
  }
}

function getDataSize(data: WebSocketData): number {
  if (typeof data === 'string') {
    return data.length
  }

  if (data instanceof Blob) {
    return data.size
  }

  return data.byteLength
}
