// @vitest-environment node
import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
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
      // so define the delayed route on a different path.
      router.get('/resource', async () => {
        await setTimeout(300)
        return new Response('original-response')
      })
    },
  })
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('handles concurrent requests with different response sources', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    if (request.headers.get('x-ignore-request')) {
      return
    }

    await setTimeout(250)

    controller.respondWith(new Response('mocked-response', { status: 201 }))
  })

  const requests = await Promise.all([
    toWebResponse(http.get(httpServer.http.url('/resource').href)),
    toWebResponse(
      http.get(httpServer.http.url('/resource').href, {
        headers: {
          'x-ignore-request': 'yes',
        },
      })
    ),
  ])

  expect(requests[0][0].status).toEqual(201)
  await expect(requests[0][0].text()).resolves.toBe('mocked-response')

  expect(requests[1][0].status).toEqual(200)
  await expect(requests[1][0].text()).resolves.toBe('original-response')
})
