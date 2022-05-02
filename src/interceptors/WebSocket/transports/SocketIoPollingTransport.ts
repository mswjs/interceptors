import { Debugger, debug } from 'debug'
import { StrictEventEmitter } from 'strict-event-emitter'
import type {
  HttpRequestEventMap,
  InteractiveIsomorphicRequest,
  IsomorphicRequest,
} from '../../../glossary'
import type { Interceptor } from '../../../Interceptor'
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

export class SocketIoPollingTransport extends Transport {
  private log: Debugger
  private sockets: Map<string, { open: boolean }>
  private emitter: StrictEventEmitter<{
    'transport:send'(data: string): void
  }>

  constructor(private readonly interceptor: Interceptor<HttpRequestEventMap>) {
    super()

    this.log = debug('socket-io-polling-transport')

    this.sockets = new Map()
    this.emitter = new StrictEventEmitter()

    this.subscriptions.push(() => this.interceptor.dispose())
    this.subscriptions.push(() => this.sockets.clear())
    this.subscriptions.push(() => this.emitter.removeAllListeners())
  }

  public open(): void {
    const log = this.log.extend('open')
    log('opening a new transport...')

    const pollingInterval = 25000

    this.interceptor.on(
      'request',
      async function handleTransportRequest(
        this: SocketIoPollingTransport,
        request: InteractiveIsomorphicRequest
      ) {
        // Ignore irrelevant requests.
        // There's no URL matching in interceptors, so this listener
        // will trigger on every request on the page.
        if (!isSocketIoPollingRequest(request)) {
          return
        }

        if (this.interceptor['readyState'] === 'DISPOSED') {
          throw new Error('CANNOT RUN THIS IS MADNESS')
        }

        const sessionId = request.url.searchParams.get('sid')

        log('intercepted:', request.method, request.url.href)
        log('sockets:', this.sockets)

        if (isHandshakeRequest(request)) {
          const newSessionId = uuidv4()

          log('-> handshake request')
          log('<- handshake ok')
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
          const socket = this.sockets.get(sessionId)

          if (socket?.open) {
            log('-> poll', sessionId)

            let responseInterval: NodeJS.Timer

            const stopPolling = () => {
              clearInterval(responseInterval)
            }

            const pollingResponseBody = new Promise<string>(async (resolve) => {
              // Respond with an "ok" PONG response body once the ping
              // interval expires.
              responseInterval = setInterval(() => {
                log('<- pong')
                resolve(createPingResponse())
              }, pollingInterval)

              this.subscriptions.push(function clearPollingInterval() {
                /**
                 * @todo Check what SocketIO server sends when closing a connection.
                 * Maybe it's something different than a PONG response?
                 */
                resolve(createPingResponse())
              })

              // Resolve the ping request immediately if the server
              // sends something to the client.
              /**
               * @todo @fixme Check how this behaves with multiple
               * clients that ping/poing at the same time.
               * May introduce a sessionId check in the listener.
               */
              this.emitter.once('transport:send', (data) => {
                log('<- message (server)')
                resolve(data)
              })
            }).finally(() => {
              // Stop polling no matter what resolved the polling Promise.
              // "socket.io" will issue a new polling request and it will
              // get intercepted in this clause again.
              stopPolling()
            })

            const responseBody = await pollingResponseBody
            log('<- %s', responseBody)

            return request.respondWith({
              status: 200,
              headers: {
                Connection: 'keep-alive',
                'Keep-Alive': 'timeout=5',
                'Content-Type': 'text/plain',
              },
              body: responseBody,
            })
          }

          // Mark the request session as open so that subsequent GET requests
          // with the session ID would trigger a ping/pong instead of
          // opening it again.
          this.sockets.set(sessionId, { open: true })

          log('-> new connection')
          log('<- open', sessionId)

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
          log('->', request.body)
          log('<- ok')
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
      }.bind(this)
    )
  }

  public send(data: WebSocketMessageData): void {
    const log = this.log.extend('send')
    log(data)

    this.emitter.emit('transport:send', data.toString())
  }
}
