// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/810
 */
import http from 'node:http'
import { invariant } from 'outvariant'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

/**
 * A real proxy server that refuses all tunnels.
 * Serves as the compliance reference for the mocked behavior.
 */
const realProxy = http.createServer()
realProxy.on('connect', (request, socket) => {
  socket.end(
    'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
  )
})

type ClientEvent = [name: string, ...args: Array<unknown>]

/**
 * Send a "CONNECT" request to the given proxy and record
 * all events the client observes.
 */
function requestTunnel(proxyPort: number): Array<ClientEvent> {
  const events: Array<ClientEvent> = []

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: proxyPort,
      path: 'example.com:443',
    })
    .end()

  request
    .on('connect', (response, socket, head) => {
      events.push(['request:connect', response.statusCode, head.byteLength])
      socket
        .on('data', (chunk) => events.push(['socket:data', chunk.byteLength]))
        .on('end', () => events.push(['socket:end']))
        .on('error', (error) => events.push(['socket:error', error.message]))
        .on('close', (hadError) => events.push(['socket:close', hadError]))
    })
    .on('response', (response) =>
      events.push(['request:response', response.statusCode])
    )
    .on('error', (error) => events.push(['request:error', error.message]))
    .on('close', () => events.push(['request:close']))

  return events
}

beforeAll(async () => {
  interceptor.apply()
  await new Promise<void>((resolve) => {
    realProxy.listen(0, '127.0.0.1', resolve)
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await new Promise((resolve) => realProxy.close(resolve))
})

it('closes the connection for a mocked non-2xx response to "CONNECT" like a real proxy', async () => {
  const address = realProxy.address()
  invariant(address != null && typeof address === 'object')

  // First, record how the client observes a real proxy refusing the tunnel.
  const realEvents = requestTunnel(address.port)
  await expect
    .poll(() => realEvents.at(-1)?.[0])
    .toBe('socket:close')

  // Then, refuse the tunnel with a mocked response.
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'CONNECT') {
      controller.respondWith(new Response(null, { status: 403 }))
    }
  })

  const mockedEvents = requestTunnel(1234)
  await expect.poll(() => mockedEvents).toEqual(realEvents)
})
