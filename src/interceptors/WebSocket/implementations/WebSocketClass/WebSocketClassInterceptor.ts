import { invariant } from 'outvariant'
import type { WebSocketEventsMap } from '../../index'
import { Interceptor } from '../../../../Interceptor'
import { WebSocketClassClient } from './WebSocketClassClient'
import { WebSocketClassServer } from './WebSocketClassServer'
import type { WebSocketSendData } from '../../WebSocketTransport'
import { bindEvent } from '../../utils/bindEvent'
import { WebSocketClassTransport } from './WebSocketClassTransport'

export class WebSocketClassInterceptor extends Interceptor<WebSocketEventsMap> {
  static symbol = Symbol('websocket-class')

  constructor() {
    super(WebSocketClassInterceptor.symbol)
  }

  protected checkEnvironment(): boolean {
    // Enable this interceptor in any environment
    // that has a global WebSocket API.
    return typeof globalThis.WebSocket !== 'undefined'
  }

  protected setup(): void {
    const webSocketProxy = Proxy.revocable(globalThis.WebSocket, {
      construct: (
        target,
        args: ConstructorParameters<typeof globalThis.WebSocket>,
        newTarget
      ) => {
        const [url, protocols] = args

        const createConnection = (): WebSocket => {
          return Reflect.construct(target, args, newTarget)
        }

        // All WebSocket instances are mocked and don't forward
        // any events to the original server (no connection established).
        // To forward the events, the user must use the "server.send()" API.
        const mockWs = new WebSocketClassOverride(url, protocols)
        const transport = new WebSocketClassTransport(mockWs)

        // The "globalThis.WebSocket" class stands for
        // the client-side connection. Assume it's established
        // as soon as the WebSocket instance is constructed.
        this.emitter.emit('connection', {
          client: new WebSocketClassClient(mockWs, transport),
          server: new WebSocketClassServer(mockWs, createConnection, transport),
        })

        return mockWs
      },
    })

    globalThis.WebSocket = webSocketProxy.proxy

    this.subscriptions.push(() => {
      webSocketProxy.revoke()
    })
  }
}

const WEBSOCKET_CLOSE_CODE_RANGE_ERROR =
  'InvalidAccessError: close code out of user configurable range'

export const kOnSend = Symbol('kOnSend')

type WebSocketEventListener = (this: WebSocket, event: Event) => void
export type WebSocketMessageListener = (
  this: WebSocket,
  event: MessageEvent
) => void
type WebSocketCloseListener = (this: WebSocket, event: CloseEvent) => void

export class WebSocketClassOverride extends EventTarget implements WebSocket {
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
  public binaryType: BinaryType
  public readyState: number
  public bufferedAmount: number

  private _onopen: WebSocketEventListener | null = null
  private _onmessage: WebSocketMessageListener | null = null
  private _onerror: WebSocketEventListener | null = null
  private _onclose: WebSocketCloseListener | null = null

  private [kOnSend]?: (data: WebSocketSendData) => void

  constructor(url: string | URL, protocols?: string | Array<string>) {
    super()
    this.url = url.toString()
    this.protocol = protocols ? protocols[0] : 'ws'
    this.extensions = ''
    this.binaryType = 'arraybuffer'
    this.readyState = this.CONNECTING
    this.bufferedAmount = 0

    Reflect.set(this, 'readyState', this.CONNECTING)
    queueMicrotask(() => {
      Reflect.set(this, 'readyState', this.OPEN)
      this.dispatchEvent(bindEvent(this, new Event('open')))
    })
  }

  set onopen(listener: WebSocketEventListener | null) {
    this.removeEventListener('open', this._onopen)
    this._onopen = listener
    if (listener !== null) {
      this.addEventListener('open', listener)
    }
  }
  get onopen(): WebSocketEventListener | null {
    return this._onopen
  }

  set onmessage(listener: WebSocketMessageListener | null) {
    this.removeEventListener(
      'message',
      this._onmessage as WebSocketEventListener
    )
    this.onmessage = listener
    if (listener !== null) {
      this.addEventListener('message', listener)
    }
  }
  get onmessage(): WebSocketMessageListener | null {
    return this._onmessage
  }

  set onerror(listener: WebSocketEventListener | null) {
    this.removeEventListener('error', this._onerror)
    this._onerror = listener
    if (listener !== null) {
      this.addEventListener('error', listener)
    }
  }
  get onerror(): WebSocketEventListener | null {
    return this._onerror
  }

  set onclose(listener: WebSocketCloseListener | null) {
    this.removeEventListener('close', this._onclose as WebSocketEventListener)
    this._onclose = listener
    if (listener !== null) {
      this.addEventListener('close', listener)
    }
  }
  get onclose(): WebSocketCloseListener | null {
    return this._onclose
  }

  /**
   * @see https://websockets.spec.whatwg.org/#ref-for-dom-websocket-send%E2%91%A0
   */
  public send(data: WebSocketSendData): void {
    if (this.readyState === this.CONNECTING) {
      this.close()
      throw new DOMException('InvalidStateError')
    }

    // Sending when the socket is about to close
    // discards the sent data.
    if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
      return
    }

    // Buffer the data to send in this even loop
    // but send it in the next.
    this.bufferedAmount += getDataSize(data)

    queueMicrotask(() => {
      // This is a bit optimistic but since no actual data transfer
      // is involved, all the data will be "sent" on the next tick.
      this.bufferedAmount = 0

      /**
       * @note Notify the parent about outgoing data.
       * This notifies the transport and the connection
       * listens to the outgoing data to emit the "message" event.
       */
      this[kOnSend]?.(data)
    })
  }

  public close(code: number = 1000, reason?: string): void {
    invariant(code, WEBSOCKET_CLOSE_CODE_RANGE_ERROR)
    invariant(
      code === 1000 || (code >= 3000 && code <= 4999),
      WEBSOCKET_CLOSE_CODE_RANGE_ERROR
    )

    if (this.readyState === this.CLOSING || this.readyState === this.CLOSED) {
      return
    }

    queueMicrotask(() => {
      this.dispatchEvent(
        bindEvent(
          this,
          new CloseEvent('close', {
            code,
            reason,
            wasClean: code === 1000,
          })
        )
      )

      // Remove all event listeners once the socket is closed.
      this._onopen = null
      this._onmessage = null
      this._onerror = null
      this._onclose = null
    })
  }

  public addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, event: WebSocketEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void
  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  public addEventListener(
    type: unknown,
    listener: unknown,
    options?: unknown
  ): void {
    return super.addEventListener(
      type as string,
      listener as EventListener,
      options as AddEventListenerOptions
    )
  }

  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    return super.removeEventListener(type, callback, options)
  }
}

function getDataSize(data: WebSocketSendData): number {
  if (typeof data === 'string') {
    return data.length
  }

  if (data instanceof Blob) {
    return data.size
  }

  return data.byteLength
}
