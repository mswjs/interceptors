// @vitest-environment node
import { createHash } from 'node:crypto'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { FetchResponse } from '#/src/utils/fetchUtils'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

/**
 * Derive the "sec-websocket-accept" header value from the
 * handshake key sent by the WebSocket client.
 * @see https://datatracker.ietf.org/doc/html/rfc6455#section-1.3
 */
function getWebSocketAcceptKey(secWebSocketKey: string): string {
  return createHash('sha1')
    .update(`${secWebSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => {
      resolve()
    })
    socket.addEventListener('error', () => {
      reject(new Error('WebSocket connection failed'))
    })
  })
}

it('mocks an upgrade response and handles the next connection', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.method, request.headers.get('upgrade'))

    const secWebSocketKey = request.headers.get('sec-websocket-key')

    if (request.headers.get('upgrade') === 'websocket' && secWebSocketKey) {
      /**
       * @note The Fetch API `Response` forbids non-configurable
       * status codes like 101. Use the `FetchResponse` helper class.
       */
      controller.respondWith(
        new FetchResponse(null, {
          status: 101,
          statusText: 'Switching Protocols',
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-accept': getWebSocketAcceptKey(secWebSocketKey),
          },
        })
      )
    }
  })

  const socket = new WebSocket('ws://example.com/socket')
  await waitForOpen(socket)

  expect(socket.readyState).toBe(WebSocket.OPEN)

  // Every WebSocket connection performs its own upgrade request,
  // so the next connection is handled by the same request listener.
  const nextSocket = new WebSocket('ws://example.com/socket')
  await waitForOpen(nextSocket)

  expect(nextSocket.readyState).toBe(WebSocket.OPEN)

  expect(requestListener).toHaveBeenCalledTimes(2)
  expect(requestListener).toHaveBeenNthCalledWith(1, 'GET', 'websocket')
  expect(requestListener).toHaveBeenNthCalledWith(2, 'GET', 'websocket')
})

it('performs an upgrade request against the actual server', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request }) => {
    requestListener(request.method, request.headers.get('upgrade'))
  })

  const socket = new WebSocket(server.ws.url('?greet'))

  const messagePromise = new Promise<MessageEvent>((resolve, reject) => {
    socket.addEventListener('message', resolve)
    socket.addEventListener('error', () => {
      reject(new Error('WebSocket connection failed'))
    })
  })

  await waitForOpen(socket)
  await expect(messagePromise).resolves.toHaveProperty('data', 'hello world')

  // The unhandled upgrade request still emits the "request" event.
  expect(requestListener).toHaveBeenCalledOnce()
  expect(requestListener).toHaveBeenCalledWith('GET', 'websocket')

  socket.close()
})
