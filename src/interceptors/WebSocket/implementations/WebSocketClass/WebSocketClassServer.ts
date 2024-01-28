import { invariant } from 'outvariant'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketServer } from '../../WebSocketServer'
import type {
  WebSocketClassOverride,
  WebSocketMessageListener,
} from './WebSocketClassInterceptor'
import type { WebSocketSendData } from '../../WebSocketTransport'
import { bindEvent } from '../../utils/bindEvent'

export class WebSocketClassServer extends WebSocketServer {
  private prodWs?: WebSocket

  constructor(
    private readonly mockWs: WebSocketClassOverride,
    private readonly createConnection: () => WebSocket
  ) {
    super()
  }

  public connect(): Promise<void> {
    const connectionPromise = new DeferredPromise<void>()
    const ws = this.createConnection()

    ws.addEventListener('open', () => connectionPromise.resolve(), {
      once: true,
    })
    ws.addEventListener('error', () => connectionPromise.reject(), {
      once: true,
    })

    return connectionPromise
      .then(() => {
        this.prodWs = ws
      })
      .catch((error) => {
        console.error(
          'Failed to connect to the original WebSocket server at "%s"',
          this.mockWs.url
        )
        console.error(error)
      })
  }

  public send(data: WebSocketSendData): void {
    invariant(
      this.prodWs,
      'Failed to call "server.send()" for "%s": the connection is not open. Did you forget to call "await server.connect()"?',
      this.mockWs.url
    )

    // Send the data using the original WebSocket connection.
    this.prodWs.send(data)
  }

  public on(event: 'message', callback: WebSocketMessageListener): void {
    invariant(
      this.prodWs,
      'Failed to call "server.on(%s)" for "%s": the connection is not open. Did you forget to call "await server.connect()"?',
      this.mockWs.url
    )

    const { prodWs } = this

    prodWs.addEventListener(event, (messageEvent) => {
      callback.call(prodWs, messageEvent)

      // Unless the default is prevented, forward the
      // messages from the original server to the mock client.
      // This is the only way the user can receive them.
      if (!messageEvent.defaultPrevented) {
        this.mockWs.dispatchEvent(bindEvent(this.mockWs, messageEvent))
      }
    })
  }
}
