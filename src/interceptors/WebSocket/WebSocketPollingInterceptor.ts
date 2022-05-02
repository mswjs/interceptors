import type {
  HttpRequestEventMap,
  InteractiveIsomorphicRequest,
  WebSocketEventMap,
} from '../../glossary'
import { Interceptor } from '../../Interceptor'
import {
  isHandshakeRequest,
  isSocketIoPollingRequest,
  SocketIoPollingTransport,
} from './transports/SocketIoPollingTransport'
import { Connection } from './Connection'
import { createEvent } from '../../utils/createEvent'
import { SocketIoConnection } from './SocketIoConnection'
import { MessageEventPolyfill } from '../../polyfills/MessageEventPolyfill'

export interface WebSocketPollingInterceptorOptions {
  /**
   * Interceptor instance to use for the interception of requests.
   */
  using: Interceptor<HttpRequestEventMap>
}

export class WebSocketPollingInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol('websocket-polling-interceptor')

  private connection: Connection = null as any
  protected interceptor: Interceptor<HttpRequestEventMap>

  constructor(protected readonly options: WebSocketPollingInterceptorOptions) {
    super(WebSocketPollingInterceptor.symbol)
    this.interceptor = options.using
  }

  protected checkEnvironment() {
    return true
  }

  protected setup() {
    this.interceptor.apply()
    this.subscriptions.push(() => this.interceptor.dispose())

    this.connection = new SocketIoConnection({
      transport: new SocketIoPollingTransport(this.interceptor),
    })

    this.subscriptions.push(() => {
      this.connection['close']()
    })

    // Invoke the open callback immediately because it adds a request listener
    // in the transport that intercepts and handles all the handshake requests.
    this.connection['onOpen']()

    this.interceptor.on('request', this.handleInitialConnection.bind(this))
  }

  private handleInitialConnection(request: InteractiveIsomorphicRequest) {
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
        createEvent(MessageEventPolyfill, 'message', {
          data: request.body || null,
        })
      )
      return
    }

    if (request.method === 'POST' && request.body === '41') {
      // Close request.
      // Server responds with "ok"
    }

    if (request.method === 'POST' && request.body === '1') {
      // Close request.
      // Server responds with "ok"
    }
  }
}
