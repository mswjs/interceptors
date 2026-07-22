// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/pull/706
 */
import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      // The test server registers its own "GET /" route,
      // so define the streaming route on a different path.
      router.get('/resource', () => {
        const encoder = new TextEncoder()
        // Triggers 2 reads in the MockHttpSocket
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('hello'))
            controller.enqueue(encoder.encode(' world'))
            controller.close()
          },
        })

        return new Response(stream)
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('does not buffer socket pushes for a passthrough request', async () => {
  const request = http.get(httpServer.http.url('/resource').href)
  const [response] = await toWebResponse(request)

  await expect(response.text()).resolves.toBe('hello world')
  expect(
    request.socket?.listenerCount('connect'),
    'Must not add "connection" listeners to the socket. Those listeners mean no "_handle" exists on the mock socket.'
  ).toBe(0)
})
