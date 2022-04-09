import type { WebSocketEventMap } from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { XMLHttpRequestInterceptor } from '../XMLHttpRequest'
import {
  isHandshakeRequest,
  isSocketIoPollingRequest,
  XMLHttpRequestTransport,
} from './transports/XMLHttpRequestTransport'
import { Connection } from './Connection'
import { createEvent } from '../../utils/createEvent'
import { SocketIoConnection } from './SocketIoConnection'

export class WebSocketPollingInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol('websocket-polling-interceptor')

  private connection: Connection = null as any

  constructor() {
    super(WebSocketPollingInterceptor.symbol)
  }

  protected checkEnvironment() {
    return true
  }

  protected setup() {
    /**
     * @todo Check the environment and use different interceptors
     * if running in the browser or Node.js.
     */
    const xhr = new XMLHttpRequestInterceptor()
    xhr.apply()
    this.subscriptions.push(() => xhr.dispose())

    this.connection = new SocketIoConnection({
      transport: new XMLHttpRequestTransport(xhr),
    })
    this.subscriptions.push(() => this.connection['close']())

    // Invoke the open callback immediately because it adds a request listener
    // in the transport that intercepts and handles all the handshake requests.
    this.connection['onOpen']()

    xhr.on('request', (request) => {
      if (!isSocketIoPollingRequest(request)) {
        return
      }

      // Signal the interceptor that a new socket connection has been established.
      // It's safe to assume a connection on a handshake request because the entire
      // handshake/open/ping/pong sequence is mocked by the transport.
      if (isHandshakeRequest(request)) {
        this.emitter.emit('connection', this.connection)
        return
      }

      // A POST request with a body starting with "42" indicates an outgoing
      // client-side message being sent.
      if (request.method === 'POST' && request.body?.startsWith('42')) {
        this.connection['onMessage'](
          createEvent(MessageEvent, 'message', {
            data: request.body,
          })
        )
        return
      }
    })
  }
}
