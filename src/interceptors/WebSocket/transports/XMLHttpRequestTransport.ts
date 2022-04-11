import { StrictEventEmitter } from 'strict-event-emitter'
import type {
  HttpRequestEventMap,
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
} from '../../../glossary'
import type { Interceptor } from '../../../Interceptor'
import { sleep } from '../../../utils/sleep'
import { uuidv4 } from '../../../utils/uuid'
import {
  createHandshakeResponse,
  createOpenResponse,
  createPingResponse,
} from '../SocketIoConnection'
import { WebSocketMessageData } from '../WebSocketOverride'
import { Transport } from './WebSocketTransport'

export function isSocketIoPollingRequest(request: IsomorphicRequest): boolean {
  return (
    request.url.pathname.includes('/socket.io/') &&
    request.url.searchParams.get('transport') === 'polling'
  )
}

export function isHandshakeRequest(request: IsomorphicRequest): boolean {
  return request.method === 'GET' && !request.url.searchParams.get('sid')
}

export class XMLHttpRequestTransport extends Transport {
  private sockets: Map<string, { open: boolean }>
  private emitter: StrictEventEmitter<{ 'transport:send'(data: string): void }>

  constructor(private readonly interceptor: Interceptor<HttpRequestEventMap>) {
    super()

    this.sockets = new Map()
    this.emitter = new StrictEventEmitter()
  }

  public open(): void {
    const pollingInterval = 25000

    this.interceptor.on('request', async (request) => {
      // Ignore irrelevant requests.
      // There's no URL matching in interceptors, so this listener
      // will trigger on every request on the page.
      if (!isSocketIoPollingRequest(request)) {
        return
      }

      const sessionId = request.url.searchParams.get('sid')

      if (isHandshakeRequest(request)) {
        const newSessionId = uuidv4()

        return request.respondWith({
          status: 200,
          headers: {
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5',
            'Content-Type': 'text/plain',
          },
          body: createHandshakeResponse(newSessionId, pollingInterval),
        })
      }

      if (request.method === 'GET' && sessionId) {
        const isSocketOpen = this.sockets.get(sessionId)?.open ?? false

        if (isSocketOpen) {
          const pollingResponseBody = new Promise<string>(async (resolve) => {
            // Respond with an "ok" PONG response body once the ping
            // interval expires.
            const responseInterval = setInterval(() => {
              resolve(createPingResponse())
            }, pollingInterval)

            // Resolve the ping request immediately if the server
            // sends something to the client.
            this.emitter.on('transport:send', (data) => {
              clearInterval(responseInterval)
              resolve(data)
            })
          })

          return request.respondWith({
            status: 200,
            headers: {
              Connection: 'keep-alive',
              'Keep-Alive': 'timeout=5',
              'Content-Type': 'text/plain',
            },
            body: await pollingResponseBody,
          })
        }

        // Mark the request session as open so that subsequent GET requests
        // with the session ID would trigger a ping/pong instead of
        // opening it again.
        this.sockets.set(sessionId, { open: true })

        return request.respondWith({
          status: 200,
          headers: {},
          /**
           * @note "socket.io" responds with a different session ID
           * in this particular case.
           */
          body: createOpenResponse(sessionId),
        })
      }

      /**
       * @note Server responds "ok" to ALL POST requests.
       * Need to check how it handles incoming messages from the server.
       */
      if (request.method === 'POST') {
        return request.respondWith({
          status: 200,
          headers: {
            Connection: 'keep-alive',
            'Keep-Alive': 'timeout=5',
            'Content-Type': 'text/html',
          },
          body: 'ok',
        })
      }
    })
  }

  public send(data: WebSocketMessageData): void {
    this.emitter.emit('transport:send', data.toString())
  }
}
