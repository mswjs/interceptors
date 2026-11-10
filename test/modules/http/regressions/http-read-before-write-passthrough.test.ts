// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/862
 */
import { once } from 'node:events'
import http from 'node:http'
import net from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { BatchInterceptor } from '#/src/batch-interceptor'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { FetchInterceptor } from '#/src/interceptors/fetch/node'

/**
 * @note The client interceptors provide the request context of the
 * connection, which tells an HTTP client that is yet to write from
 * a client waiting for the server to speak first.
 */
const interceptor = new BatchInterceptor({
  name: 'read-before-write',
  interceptors: [new ClientRequestInterceptor(), new FetchInterceptor()],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a request ended after the client started reading the socket', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.url)
    controller.respondWith(new Response('mocked'))
  })

  const responseText = await new Promise<string>((resolve, reject) => {
    const request = http.request('http://example.test/resource', {
      method: 'POST',
    })
    request.on('response', (response) => {
      const chunks: Array<Buffer> = []
      response.on('data', (chunk) => {
        chunks.push(chunk)
      })
      response.on('end', () => {
        resolve(Buffer.concat(chunks).toString())
      })
    })
    request.on('error', reject)

    /**
     * @note The client attaches its socket readers on connect but
     * writes the request headers only once the body is ended, after
     * the interceptor has already decided whether the socket is HTTP.
     */
    setTimeout(20).then(() => {
      request.end('hello')
    })
  })

  expect(responseText).toBe('mocked')
  expect(requestListener).toHaveBeenCalledWith('http://example.test/resource')
})

it('intercepts a fetch request whose body arrives after the client started reading the socket', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.url)
    controller.respondWith(new Response('mocked'))
  })

  const response = await fetch('http://example.test/resource', {
    method: 'POST',
    // @ts-expect-error Undocumented Node.js property.
    duplex: 'half',
    body: new ReadableStream({
      async pull(controller) {
        await setTimeout(20)
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.close()
      },
    }),
  })

  expect(await response.text()).toBe('mocked')
  expect(requestListener).toHaveBeenCalledWith('http://example.test/resource')
})

it('intercepts a request sent over the socket undici reopens for an aborted request', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', async ({ request, controller }) => {
    requestListener(request.method, request.url)

    if (request.method === 'GET') {
      await setTimeout(200)
      controller.respondWith(new Response('slow'))
      return
    }

    await setTimeout(20)
    controller.respondWith(new Response('mocked'))
  })

  /**
   * @note Track the connections undici opens to this origin. The
   * origin is unique to this test so no idle connection from the
   * previous tests can serve the requests below instead.
   */
  const sockets = new Set<net.Socket>()
  const realSocketConnect = net.Socket.prototype.connect
  using _ = vi
    .spyOn(net.Socket.prototype, 'connect')
    .mockImplementation(function (this: net.Socket, ...args) {
      sockets.add(this)
      return Reflect.apply(realSocketConnect, this, args)
    })

  const abortController = new AbortController()
  const abortedRequestPromise = fetch('http://reopened.example.test/slow', {
    signal: abortController.signal,
  }).then<Error>(
    () => expect.fail('must not return any response'),
    (error) => error
  )

  await vi.waitFor(() => {
    expect(requestListener).toHaveBeenCalledWith(
      'GET',
      'http://reopened.example.test/slow'
    )
  })
  expect(sockets.size).toBe(1)

  /**
   * @note On abort, undici destroys the socket, re-queues the aborted
   * request, and opens a new connection for it. By the time that
   * connection is up, the request is gone, so nothing is written to it.
   * The idle socket is then kept for the next request to this origin.
   */
  abortController.abort()
  await expect(abortedRequestPromise).resolves.toHaveProperty(
    'name',
    'AbortError'
  )
  await vi.waitFor(() => {
    expect(sockets.size).toBe(2)
  })

  const [, reopenedSocket] = Array.from(sockets)

  if (reopenedSocket.connecting) {
    await once(reopenedSocket, 'connect')
  }

  const reopenedSocketWrite = vi.spyOn(reopenedSocket, 'write')
  const response = await fetch('http://reopened.example.test/resource', {
    method: 'POST',
  })

  expect(await response.text()).toBe('mocked')
  expect(requestListener).toHaveBeenCalledWith(
    'POST',
    'http://reopened.example.test/resource'
  )

  // The request was written to the reopened socket, not to a new one.
  expect.soft(sockets.size).toBe(2)
  expect
    .soft(
      reopenedSocketWrite.mock.calls.some(([chunk]) => {
        return String(chunk).startsWith('POST /resource HTTP/1.1')
      })
    )
    .toBe(true)
})
