// @vitest-environment node
import net from 'node:net'
import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
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

it('does not leak a mocked request sent in a single write to the server of a previously passed-through exchange', async () => {
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
  socket.write(
    'GET /mocked HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n'
  )
  await expect.poll(() => buffer).toContain('mock')

  // Give any leaked bytes a chance to reach the server.
  await setTimeout(100)

  // The server must observe only the passed-through exchange.
  expect(serverReceivedData).toContain('/passthrough')
  expect(serverReceivedData).not.toContain('/mocked')

  socket.destroy()
})

it('does not leak a mocked request sent in multiple writes to the server of a previously passed-through exchange', async () => {
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

  // Exchange 2 on the same connection: a mocked request whose
  // message spans multiple writes (the first write alone does not
  // complete the request headers).
  buffer = ''
  socket.write('GET /mocked HTTP/1.1\r\n')
  socket.write('Host: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n')
  await expect.poll(() => buffer).toContain('mock')

  // Give any leaked bytes a chance to reach the server.
  await setTimeout(100)

  // The server must observe only the passed-through exchange.
  expect(serverReceivedData).toContain('/passthrough')
  expect(serverReceivedData).not.toContain('/mocked')

  socket.destroy()
})
