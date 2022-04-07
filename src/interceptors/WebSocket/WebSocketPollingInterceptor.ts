import type {
  InteractiveIsomorphicRequest,
  WebSocketEventMap,
} from '../../glossary'
import { Interceptor } from '../../Interceptor'
import { uuidv4 } from '../../utils/uuid'
import { XMLHttpRequestInterceptor } from '../XMLHttpRequest'
import { EnginesIoParserPacketTypes } from './SocketIoConnection'
import { sleep } from '../../utils/sleep'

export class WebSocketPollingInterceptor extends Interceptor<WebSocketEventMap> {
  static symbol = Symbol('websocket-polling-interceptor')

  private sockets: Map<string, { open: boolean }>

  constructor() {
    super(WebSocketPollingInterceptor.symbol)
    this.sockets = new Map()
  }

  protected checkEnvironment() {
    return true
  }

  protected setup() {
    const xhr = new XMLHttpRequestInterceptor()
    xhr.on('request', this.handleOutgoingRequest.bind(this))
    xhr.apply()

    this.subscriptions.push(() => xhr.dispose())
  }

  private async handleOutgoingRequest(request: InteractiveIsomorphicRequest) {
    if (!request.url.pathname.includes('/socket.io/')) {
      return
    }

    const sid = request.url.searchParams.get('sid')
    const transport = request.url.searchParams.get('transport')
    const pingInterval = 25000

    if (transport !== 'polling') {
      return
    }

    console.log(request)

    switch (request.method) {
      case 'GET': {
        if (sid) {
          // Respond to FIRST GET/?sid with 40{"sid"}
          // but all the subsequent respond with "2"

          const isOpen = this.sockets.get(sid)?.open ?? false

          if (isOpen) {
            await sleep(pingInterval)
            request.respondWith({
              status: 200,
              headers: {
                Connection: 'keep-alive',
                'Content-Type': 'text/plain',
                'Keep-Alive': 'timeout=5',
              },
              body: EnginesIoParserPacketTypes.PING,
            })

            return
          }

          request.respondWith({
            status: 200,
            headers: {
              Connection: 'keep-alive',
              'Content-Type': 'text/plain',
              'Keep-Alive': 'timeout=5',
            },
            body:
              EnginesIoParserPacketTypes.MESSAGE +
              EnginesIoParserPacketTypes.OPEN +
              JSON.stringify({
                // "socket.io" respond with a different session ID
                // for this particular request.
                sid,
              }),
          })

          this.sockets.set(sid, { open: true })

          return
        }

        const newSessionId = uuidv4()

        // Handshake response from the server to welcome a new client.
        request.respondWith({
          status: 200,
          headers: {
            Connection: 'keep-alive',
            'Content-Type': 'text/plain',
            'Keep-Alive': 'timeout=5',
          },
          body:
            EnginesIoParserPacketTypes.OPEN +
            JSON.stringify({
              sid: newSessionId,
              upgrades: [],
              pingInterval,
              pingTimeout: 60000,
            }),
        })

        this.sockets.set(newSessionId, { open: false })

        return
      }

      case 'POST': {
        // "PONG" response from the server.
        request.respondWith({
          status: 200,
          headers: {
            Connection: 'keep-alive',
            'Content-Type': 'text/html',
            'Keep-Alive': 'timeout=5',
          },
          body: 'ok',
        })

        return
      }
    }
  }
}
