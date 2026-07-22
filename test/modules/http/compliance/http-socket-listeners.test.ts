// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2537
 * @see https://github.com/mswjs/interceptors/pull/755
 */
import http from 'node:http'
import { Socket } from 'node:net'
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
      router.get('/resource', () => {
        return new Response('ok')
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('removes all event listeners from a passthrough socket after closing', async () => {
  const request = http.get(httpServer.http.url('/resource').href, {
    headers: { connection: 'close' },
  })
  const pendingSocket = Promise.withResolvers<Socket>()

  request.once('socket', (socket) => {
    pendingSocket.resolve(socket)
  })

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('ok')
})
