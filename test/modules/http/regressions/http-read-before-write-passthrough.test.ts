// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/862
 */
import http from 'node:http'
import net from 'node:net'
import { setTimeout } from 'node:timers/promises'
import { BatchInterceptor } from '#/src/batch-interceptor'
import { ClientRequestInterceptor } from '#/src/interceptors/ClientRequest'
import { FetchInterceptor } from '#/src/interceptors/fetch/node'
import { toWebResponse } from '#/test/helpers'

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

/**
 * @see https://github.com/mswjs/interceptors/issues/881
 */
it('intercepts a request sent over an idle connection the client opened earlier', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', ({ request, controller }) => {
    requestListener(request.method, request.url)
    controller.respondWith(new Response('mocked'))
  })

  /**
   * @note Model a client that opens a spare connection while
   * dispatching a request, reads it, and leaves it idle until a later
   * request is written to it (e.g. undici reconnecting on abort for
   * the aborted request it has already dropped). The spare connection
   * belongs to the first request's context, and nothing is written to
   * it for longer than the read-before-write check waits.
   */
  class SpareConnectionAgent extends http.Agent {
    public spareSocket?: net.Socket

    public createConnection(options: net.NetConnectOpts): net.Socket {
      if (this.spareSocket) {
        const socket = this.spareSocket
        this.spareSocket = undefined
        return socket
      }

      this.spareSocket = net.connect(options)
      this.spareSocket.on('data', () => {})

      return net.connect(options)
    }
  }
  const agent = new SpareConnectionAgent()

  const firstRequest = http.get('http://idle.example.test/first', { agent })
  const [firstResponse] = await toWebResponse(firstRequest)
  await expect(firstResponse.text()).resolves.toBe('mocked')

  const spareSocket = agent.spareSocket
  expect(spareSocket).toBeDefined()
  await setTimeout(50)

  const request = http.request('http://idle.example.test/resource', {
    method: 'POST',
    agent,
  })
  request.end('hello')
  const [response] = await toWebResponse(request)

  await expect(response.text()).resolves.toBe('mocked')
  expect(requestListener).toHaveBeenCalledWith(
    'POST',
    'http://idle.example.test/resource'
  )
  // The request was written to the idle connection.
  expect(request.socket).toBe(spareSocket)
})
