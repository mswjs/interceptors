// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/822
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { createRawTestServer, toWebResponse } from '#/test/helpers'
import {
  TLS_CERTIFICATE,
  TLS_PRIVATE_KEY,
} from '#/test/modules/net/compliance/fixtures/tls'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

beforeEach(() => {
  interceptor.on('request', () => {})
  interceptor.on('response', () => {})
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('evicts a pooled socket closed by the server and opens a new connection', async () => {
  const serverSocket = Promise.withResolvers<net.Socket>()
  await using server = await createRawTestServer(() => {
    return http.createServer((request, response) => {
      serverSocket.resolve(request.socket)
      response.end('ok')
    })
  })
  const agent = new http.Agent({ keepAlive: true })
  onTestFinished(() => agent.destroy())
  const closeListener = vi.fn()

  const firstRequest = http.get(server.http.url('/first'), { agent })
  firstRequest.on('socket', (socket) => {
    socket.on('close', () => {
      closeListener(socket.destroyed, socket.writable)
    })
  })
  const [firstResponse] = await toWebResponse(firstRequest)
  await expect(firstResponse.text()).resolves.toBe('ok')
  await expect
    .poll(() => Object.values(agent.freeSockets).flat())
    .toHaveLength(1)

  const peerSocket = await serverSocket.promise
  peerSocket.destroy()

  await expect.poll(() => closeListener.mock.calls).toEqual([[true, false]])
  expect(Object.values(agent.freeSockets).flat()).toHaveLength(0)

  const secondRequest = http.get(server.http.url('/second'), { agent })
  const [secondResponse] = await toWebResponse(secondRequest)
  await expect(secondResponse.text()).resolves.toBe('ok')
  expect(secondRequest.reusedSocket).toBe(false)
})

it('rejects a reused request when the server closes without a response', async () => {
  await using server = await createRawTestServer(() => {
    return http.createServer((request, response) => {
      if (request.url === '/second') {
        request.socket.destroy()
        return
      }

      response.end('ok')
    })
  })
  const agent = new http.Agent({ keepAlive: true })
  onTestFinished(() => agent.destroy())

  const [firstResponse] = await toWebResponse(
    http.get(server.http.url('/first'), { agent })
  )
  await expect(firstResponse.text()).resolves.toBe('ok')

  const secondRequest = http.get(server.http.url('/second'), { agent })
  await expect(toWebResponse(secondRequest)).rejects.toThrow('socket hang up')
  expect(secondRequest.reusedSocket).toBe(true)
})

it('observes each response once with the matching request on a reused connection', async () => {
  await using server = await createRawTestServer(() => {
    return http.createServer((request, response) => {
      response.end(request.url)
    })
  })
  const agent = new http.Agent({ keepAlive: true })
  onTestFinished(() => agent.destroy())
  const requestListener = vi.fn()
  const responseListener = vi.fn()
  interceptor.on('request', ({ requestId, request }) => {
    requestListener(requestId, new URL(request.url).pathname)
  })
  interceptor.on('response', async ({ requestId, response }) => {
    responseListener(requestId, await response.text())
  })

  const [firstResponse] = await toWebResponse(
    http.get(server.http.url('/first'), { agent })
  )
  await expect(firstResponse.text()).resolves.toBe('/first')

  const secondRequest = http.get(server.http.url('/second'), { agent })
  const [secondResponse] = await toWebResponse(secondRequest)
  await expect(secondResponse.text()).resolves.toBe('/second')

  expect(secondRequest.reusedSocket).toBe(true)
  expect(requestListener).toHaveBeenCalledTimes(2)
  expect(responseListener.mock.calls).toEqual(requestListener.mock.calls)
})

it('evicts an idle HTTPS socket closed by the server', async () => {
  const serverSocket = Promise.withResolvers<net.Socket>()
  await using server = await createRawTestServer(() => {
    return https.createServer(
      { cert: TLS_CERTIFICATE, key: TLS_PRIVATE_KEY },
      (request, response) => {
        serverSocket.resolve(request.socket)
        response.end('ok')
      }
    )
  })
  const agent = new https.Agent({ keepAlive: true, ca: TLS_CERTIFICATE })
  onTestFinished(() => agent.destroy())
  const [firstResponse] = await toWebResponse(
    https.get(server.https.url('/first'), { agent })
  )
  await expect(firstResponse.text()).resolves.toBe('ok')
  await expect
    .poll(() => Object.values(agent.freeSockets).flat())
    .toHaveLength(1)

  const peerSocket = await serverSocket.promise
  peerSocket.destroy()
  await expect
    .poll(() => Object.values(agent.freeSockets).flat())
    .toHaveLength(0)

  const secondRequest = https.get(server.https.url('/second'), { agent })
  const [secondResponse] = await toWebResponse(secondRequest)
  await expect(secondResponse.text()).resolves.toBe('ok')
  expect(secondRequest.reusedSocket).toBe(false)
})

it('observes informational responses before the final response on a reused socket', async () => {
  await using server = await createRawTestServer(() => {
    return http.createServer((request, response) => {
      if (request.url === '/first') {
        response.writeEarlyHints({ link: '</style.css>; rel=preload; as=style' })
      }

      response.end(request.url)
    })
  })
  const agent = new http.Agent({ keepAlive: true })
  onTestFinished(() => agent.destroy())
  const responseListener = vi.fn()
  interceptor.on('response', async ({ request, response }) => {
    responseListener(
      new URL(request.url).pathname,
      response.status,
      await response.text()
    )
  })

  const [firstResponse] = await toWebResponse(
    http.get(server.http.url('/first'), { agent })
  )
  await expect(firstResponse.text()).resolves.toBe('/first')

  const secondRequest = http.get(server.http.url('/second'), { agent })
  const [secondResponse] = await toWebResponse(secondRequest)
  await expect(secondResponse.text()).resolves.toBe('/second')

  expect(secondRequest.reusedSocket).toBe(true)
  expect(responseListener.mock.calls).toEqual([
    ['/first', 103, ''],
    ['/first', 200, '/first'],
    ['/second', 200, '/second'],
  ])
})

it('rejects a connection closed after an informational response without a final response', async () => {
  await using server = await createRawTestServer(() => {
    return new net.Server((socket) => {
      socket.once('data', () => {
        socket.end('HTTP/1.1 103 Early Hints\r\n\r\n')
      })
    })
  })
  const responseListener = vi.fn()
  interceptor.on('response', ({ response }) => {
    responseListener(response.status)
  })

  await expect(
    toWebResponse(http.get(server.http.url('/')))
  ).rejects.toThrow('socket hang up')
  expect(responseListener).toHaveBeenCalledExactlyOnceWith(103)
})

it.skipIf(Number(process.versions.node.split('.')[0]) < 24)(
  'evicts a pooled socket receiving unsolicited bytes',
  async () => {
    const serverSocket = Promise.withResolvers<net.Socket>()
    await using server = await createRawTestServer(() => {
      return http.createServer((request, response) => {
        serverSocket.resolve(request.socket)
        response.end('ok')
      })
    })
    const agent = new http.Agent({ keepAlive: true })
    onTestFinished(() => agent.destroy())
    const [firstResponse] = await toWebResponse(
      http.get(server.http.url('/first'), { agent })
    )
    await expect(firstResponse.text()).resolves.toBe('ok')
    await expect
      .poll(() => Object.values(agent.freeSockets).flat())
      .toHaveLength(1)

    const peerSocket = await serverSocket.promise
    peerSocket.write('\r\n')
    await expect
      .poll(() => Object.values(agent.freeSockets).flat())
      .toHaveLength(0)

    const secondRequest = http.get(server.http.url('/second'), { agent })
    const [secondResponse] = await toWebResponse(secondRequest)
    await expect(secondResponse.text()).resolves.toBe('ok')
    expect(secondRequest.reusedSocket).toBe(false)
  }
)
