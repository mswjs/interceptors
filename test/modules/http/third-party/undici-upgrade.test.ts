// @vitest-environment node
import { request, upgrade } from 'undici'
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

it('mocks an upgrade response and handles the next connection', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.headers.get('upgrade') === 'websocket') {
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
          },
        })
      )
      return
    }

    controller.respondWith(new Response('next connection'))
  })

  const { headers, socket } = await upgrade('http://example.com/socket', {
    protocol: 'websocket',
  })

  expect(headers.upgrade).toBe('websocket')
  expect(socket.closed).toBe(false)

  socket.destroy()

  // The upgraded socket now speaks a non-HTTP protocol, so the
  // client dispatches the next request over a new connection.
  // The same request listener handles that request as usual.
  const nextResponse = await request('http://example.com/resource')

  expect(nextResponse.statusCode).toBe(200)
  await expect(nextResponse.body.text()).resolves.toBe('next connection')
})

it('performs an upgrade request against the actual server', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request }) => {
    requestListener(request.method, request.headers.get('upgrade'))
  })

  const url = new URL(server.ws.href)
  url.protocol = 'http:'

  const { headers, socket } = await upgrade(url.href, {
    protocol: 'websocket',
    headers: {
      /**
       * @note The sample handshake key from RFC 6455.
       * The server derives "sec-websocket-accept" from it.
       * @see https://datatracker.ietf.org/doc/html/rfc6455#section-1.3
       */
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
  })

  expect(headers.upgrade).toBe('websocket')
  expect(headers['sec-websocket-accept']).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=')

  // The unhandled upgrade request still emits the "request" event.
  expect(requestListener).toHaveBeenCalledOnce()
  expect(requestListener).toHaveBeenCalledWith('GET', 'websocket')

  socket.destroy()
})
