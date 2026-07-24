// @vitest-environment node
import net from 'node:net'
import http from 'node:http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { createRawTestServer } from '#/test/helpers'

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

it.each([
  [
    'a single write',
    ['GET /mocked HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n'],
  ],
  [
    'multiple writes',
    [
      'GET /mocked HTTP/1.1\r\n',
      'Host: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n',
    ],
  ],
])(
  'does not leak a mocked request sent in %s to the server of a previously passed-through exchange',
  async (_, mockedRequestWrites) => {
    let serverReceivedData = ''

    await using server = await createRawTestServer(() => {
      const server = http.createServer((request, response) => {
        response.end('real')
      })
      server.on('connection', (connection) => {
        connection.on('data', (chunk) => {
          serverReceivedData += chunk.toString()
        })
      })
      return server
    })

    interceptor.on('request', ({ request, controller }) => {
      if (new URL(request.url).pathname === '/mocked') {
        controller.respondWith(new Response('mock'))
      }
    })

    const socket = net.connect(server.port, server.hostname)
    socket.setEncoding('utf8')

    let buffer = ''
    socket.on('data', (chunk) => (buffer += chunk))

    // Exchange 1: an unhandled request passes through to the server.
    socket.write(
      'GET /passthrough HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n'
    )
    await expect.poll(() => buffer).toContain('real')

    // Exchange 2 on the same connection: a mocked request.
    buffer = ''
    for (const data of mockedRequestWrites) {
      socket.write(data)
    }
    await expect.poll(() => buffer).toContain('mock')

    // Give any leaked bytes a chance to reach the server.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // The server must observe only the passed-through exchange.
    expect(serverReceivedData).toContain('/passthrough')
    expect(serverReceivedData).not.toContain('/mocked')

    socket.destroy()
  }
)
