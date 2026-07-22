// @vitest-environment node
import http from 'node:http'
import { once } from 'node:events'
import { text } from 'node:stream/consumers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

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

it('supports concurrent mocked requests over a single keep-alive socket', async () => {
  interceptor.on('request', ({ controller }) => {
    /**
     * @note An explicit "Content-Length" makes the mocked response
     * self-delimiting, which allows the connection to stay alive.
     */
    controller.respondWith(
      new Response('mocked', {
        headers: {
          'content-length': '6',
        },
      })
    )
  })

  /**
   * @note With a single socket, the agent queues the second request
   * and dispatches it onto the pooled socket the moment the first
   * exchange completes ("free"), reusing the kept-alive connection.
   */
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })

  /**
   * @note Subscribe to the "response" events at request creation.
   * The second response arrives while the first response body is
   * still being read; a listener added later would miss it.
   */
  const firstRequest = http.get('http://localhost/resource', { agent })
  const firstResponsePromise = once(firstRequest, 'response')
  const secondRequest = http.get('http://localhost/resource', { agent })
  const secondResponsePromise = once(secondRequest, 'response')

  try {
    const [firstResponse] = await firstResponsePromise
    await expect(text(firstResponse)).resolves.toBe('mocked')

    const [secondResponse] = await secondResponsePromise
    await expect(text(secondResponse)).resolves.toBe('mocked')
  } finally {
    agent.destroy()
  }
})
