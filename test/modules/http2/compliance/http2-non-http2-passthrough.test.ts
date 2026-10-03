// @vitest-environment node
import net from 'node:net'
import http from 'node:http'
import { text } from 'node:stream/consumers'
import { Http2RequestInterceptor } from '#/src/interceptors/http2'
import { createRawTestServer, toWebResponse } from '#/test/helpers'

const interceptor = new Http2RequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('performs an HTTP/1 request as-is', async () => {
  await using server = await createRawTestServer(() => {
    return http.createServer((_request, response) => {
      response.end('original-response')
    })
  })

  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const request = http.get(server.http.url('/'), { agent: false })
  const [response] = await toWebResponse(request)

  await expect(response.text()).resolves.toBe('original-response')
  expect(requestListener).not.toHaveBeenCalled()
})

it('passes through a connection that does not speak HTTP/2', async () => {
  await using server = await createRawTestServer(() => {
    return net.createServer((socket) => {
      socket.once('data', (chunk) => socket.end(`echo:${chunk}`))
    })
  })

  const socket = net.connect(server.port, server.hostname)
  socket.write('hello')

  await expect(text(socket)).resolves.toBe('echo:hello')
})

it('passes through a connection where the server speaks first', async () => {
  await using server = await createRawTestServer(() => {
    return net.createServer((socket) => {
      socket.end('greeting')
    })
  })

  const socket = net.connect(server.port, server.hostname)

  await expect(text(socket)).resolves.toBe('greeting')
})

it('passes through an HTTP/2 connection preface sent after the server speaks first', async () => {
  await using server = await createRawTestServer(() => {
    return net.createServer((socket) => {
      socket.write('greeting')
      socket.once('data', (chunk) => socket.end(`echo:${chunk}`))
    })
  })

  const socket = net.connect(server.port, server.hostname)
  socket.once('data', () => {
    socket.write('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n')
  })

  await expect(text(socket)).resolves.toBe(
    'greetingecho:PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n'
  )
})
