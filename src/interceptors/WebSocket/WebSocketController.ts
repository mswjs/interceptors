import { createProxy } from '../../utils/createProxy'
import { Connection, kOnOutgoingMessage } from './connections/Connection'
import { WebSocketConnection } from './connections/WebSocketConnection'
import { extendEvent } from './utils/extendEvent'
import type { WebSocketData } from './transports/Transport'

export class WebSocketController {
  public ws: WebSocket
  public connection: Connection

  constructor(originalWebSocket: WebSocket) {
    this.connection = new WebSocketConnection(originalWebSocket)

    this.ws = createProxy(originalWebSocket, {
      methodCall: ([methodName, args], next) => {
        switch (methodName) {
          case 'send': {
            return this.send(args[0] as WebSocketData)
          }

          case 'addEventListener': {
            const [event] = args as [string]

            // Suppress the original "error" and "close" events
            // from propagating to the user-attached listeners.
            // The user will be in charge of those events via
            // the connection received in the handler.
            if (['error', 'close'].includes(event)) {
              return
            }

            return next()
          }

          default: {
            return next()
          }
        }
      },

      setProperty: ([propertyName, nextValue], next) => {
        switch (propertyName) {
          case 'onopen':
          case 'onmessage':
          case 'onclose':
          case 'onerror': {
            const eventName = propertyName.replace(/^on/, '')
            this.ws.addEventListener(
              eventName,
              nextValue as EventListenerOrEventListenerObject
            )
            return true
          }

          default: {
            return next()
          }
        }
      },
    })

    this.setReadyState(WebSocket.CONNECTING)

    this.ws.addEventListener('close', () => this.connection.close(), {
      once: true,
    })

    // Open connection.
    queueMicrotask(() => {
      this.setReadyState(WebSocket.OPEN)

      this.connection.open()

      const openEvent = new Event('open')
      extendEvent(openEvent, { target: this.ws })

      this.ws.dispatchEvent(openEvent)
    })
  }

  private setReadyState(nextState: number): void {
    Reflect.set(this.ws, 'readyState', nextState)
  }

  private send(data: WebSocketData): void {
    if (
      this.ws.readyState === WebSocket.CLOSING ||
      this.ws.readyState === WebSocket.CLOSED
    ) {
      /**
       * @todo Calculate the buffer amount.
       */
      Reflect.set(this.ws, 'bufferAmount', this.ws.bufferedAmount + 0)
      return
    }

    queueMicrotask(() => {
      // Notify the "connection" object so the user could
      // react to the outgoing (client) data in the handler.
      this.connection[kOnOutgoingMessage](data)
    })
  }
}
