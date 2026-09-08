// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/817
 */
import net from 'node:net'
import { text } from 'node:stream/consumers'
import { fetch } from 'undici'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import type { HttpResponseEvent } from '#/src/events/http'
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

it('observes a response followed by stray bytes after connection close', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.once('data', () => {
        socket.end(
          'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nokstray bytes after close'
        )
      })
    })
  })
  const responseListener = vi.fn(async ({ response }: HttpResponseEvent) => {
    await expect(response.text()).resolves.toBe('ok')
  })
  interceptor.on('request', () => {})
  interceptor.on('response', responseListener)

  const response = await fetch(server.http.url('/'))

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('ok')
  expect(responseListener).toHaveBeenCalledOnce()
})

it('lets the client reject an invalid response header', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.once('data', () => {
        socket.end('HTTP/1.1 200 OK\r\nInvalid Header: value\r\n\r\n')
      })
    })
  })
  const responseListener = vi.fn()
  interceptor.on('response', responseListener)

  await expect(fetch(server.http.url('/'))).rejects.toThrow('fetch failed')
  expect(responseListener).not.toHaveBeenCalled()
})

it('passes through an invalid request header in the first write', async () => {
  const request = 'GET / HTTP/1.1\r\nInvalid Header: value\r\n\r\n'
  const receivedRequest = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      text(socket).then(receivedRequest.resolve, receivedRequest.reject)
    })
  })
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await using socket = net.connect(server.port, server.hostname)
  socket.end(request)

  await expect(receivedRequest.promise).resolves.toBe(request)
  expect(requestListener).not.toHaveBeenCalled()
})

it('passes through an invalid request header in a subsequent write', async () => {
  const request = 'GET / HTTP/1.1\r\nInvalid Header: value\r\n\r\n'
  const receivedRequest = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      text(socket).then(receivedRequest.resolve, receivedRequest.reject)
    })
  })
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  await using socket = net.connect(server.port, server.hostname)
  await new Promise<void>((resolve) => {
    socket.write('GET / HTTP/1.1\r\n', () => {
      resolve()
    })
  })
  socket.end('Invalid Header: value\r\n\r\n')

  await expect(receivedRequest.promise).resolves.toBe(request)
  expect(requestListener).not.toHaveBeenCalled()
})

it('rejects an observed response body with invalid chunk framing', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.once('data', () => {
        socket.end(
          'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\ninvalid chunk\r\n'
        )
      })
    })
  })
  const observedBody = Promise.withResolvers<string>()
  interceptor.on('response', ({ response }) => {
    response.text().then(observedBody.resolve, observedBody.reject)
  })

  const pendingResponse = fetch(server.http.url('/')).then((response) => {
    return response.text()
  })

  await Promise.all([
    expect(observedBody.promise).rejects.toThrow(
      'Invalid character in chunk size'
    ),
    expect(pendingResponse).rejects.toThrow(),
  ])
})

it('passes through invalid chunk framing while a listener reads the request body', async () => {
  const request =
    'POST / HTTP/1.1\r\nHost: localhost\r\nTransfer-Encoding: chunked\r\n\r\ninvalid chunk\r\n'
  const receivedRequest = Promise.withResolvers<string>()
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      text(socket).then(receivedRequest.resolve, receivedRequest.reject)
    })
  })
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request }) => {
    requestListener()
    await expect(request.text()).rejects.toThrow(
      'Invalid character in chunk size'
    )
  })

  await using socket = net.connect(server.port, server.hostname)
  socket.end(request)

  await expect(receivedRequest.promise).resolves.toBe(request)
  expect(requestListener).toHaveBeenCalledOnce()
})
