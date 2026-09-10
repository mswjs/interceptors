// @vitest-environment node
import http from 'node:http'
import net from 'node:net'
import { once } from 'node:events'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { HttpRequestParser } from '#/src/interceptors/http/http-parser'
import { FetchResponse } from '#/src/utils/fetch-utils'
import { toWebResponse } from '#/test/helpers'
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

interface UpgradeEvent {
  response: http.IncomingMessage
  socket: net.Socket
  head: Buffer
}

function waitForUpgrade(request: http.ClientRequest): Promise<UpgradeEvent> {
  const upgradePromise = Promise.withResolvers<UpgradeEvent>()

  request.on('upgrade', (response, socket, head) => {
    upgradePromise.resolve({ response, socket, head })
  })
  request.on('error', (error) => {
    upgradePromise.reject(error)
  })

  return upgradePromise.promise
}

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

  const upgradeRequest = http.request('http://example.com/socket', {
    headers: {
      connection: 'Upgrade',
      upgrade: 'websocket',
    },
  })
  upgradeRequest.end()

  const { response, socket, head } = await waitForUpgrade(upgradeRequest)

  expect(response.statusCode).toBe(101)
  expect(response.statusMessage).toBe('Switching Protocols')
  expect(response.headers.upgrade).toBe('websocket')
  expect(head.byteLength).toBe(0)

  socket.destroy()

  // The upgraded socket now speaks a non-HTTP protocol, so the
  // client dispatches the next request over a new connection.
  // The same request listener handles that request as usual.
  const nextRequest = http.request('http://example.com/resource')
  nextRequest.end()

  const [nextResponse] = await toWebResponse(nextRequest)

  expect(nextResponse.status).toBe(200)
  await expect(nextResponse.text()).resolves.toBe('next connection')
})

it('performs an upgrade request against the actual server', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request }) => {
    requestListener(request.method, request.headers.get('upgrade'))
  })

  const url = new URL(server.ws.href)
  url.protocol = 'http:'

  const upgradeRequest = http.request(url.href, {
    headers: {
      connection: 'Upgrade',
      upgrade: 'websocket',
      /**
       * @note The sample handshake key from RFC 6455.
       * The server derives "sec-websocket-accept" from it.
       * @see https://datatracker.ietf.org/doc/html/rfc6455#section-1.3
       */
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      'sec-websocket-version': '13',
    },
  })
  upgradeRequest.end()

  const { response, socket } = await waitForUpgrade(upgradeRequest)

  expect(response.statusCode).toBe(101)
  expect(response.statusMessage).toBe('Switching Protocols')
  expect(response.headers.upgrade).toBe('websocket')
  expect(response.headers['sec-websocket-accept']).toBe(
    's3pPLMBiTxaQ9kYGzzhZRbK+xOo='
  )

  // The unhandled upgrade request still emits the "request" event.
  expect(requestListener).toHaveBeenCalledOnce()
  expect(requestListener).toHaveBeenCalledWith('GET', 'websocket')

  socket.destroy()
})

it('stops parsing HTTP requests when switching to another protocol', async () => {
  const upgradeServer = http.createServer()
  const connections = new Set<net.Socket>()

  onTestFinished(async () => {
    for (const connection of connections) {
      connection.destroy()
    }

    await new Promise<void>((resolve) => upgradeServer.close(() => resolve()))
    vi.restoreAllMocks()
  })

  upgradeServer.on('connection', (socket) => connections.add(socket))
  upgradeServer.on('upgrade', (_request, socket) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n'
    )
    socket.on('data', (chunk) => socket.write(chunk))
  })
  upgradeServer.listen(0, '127.0.0.1')
  await once(upgradeServer, 'listening')

  const address = upgradeServer.address()

  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address')
  }

  const execute = vi.spyOn(HttpRequestParser.prototype, 'execute')
  const free = vi.spyOn(HttpRequestParser.prototype, 'free')
  interceptor.on('request', () => {})

  const request = http.request(`http://127.0.0.1:${address.port}`, {
    headers: { connection: 'Upgrade', upgrade: 'echo' },
  })
  request.end()

  const { response, socket } = await waitForUpgrade(request)
  onTestFinished(() => {
    socket.destroy()
  })

  expect(response.statusCode).toBe(101)
  expect.soft(free).toHaveBeenCalledOnce()
  expect(execute).toHaveBeenCalledOnce()

  const data = once(socket, 'data')
  const protocolMessage = Buffer.from([0x81, 0x00])
  socket.write(protocolMessage)

  await expect(data).resolves.toEqual([protocolMessage])
  expect(execute).toHaveBeenCalledOnce()
  expect(free).toHaveBeenCalledOnce()
})
