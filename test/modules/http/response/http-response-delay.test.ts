// @vitest-environment node
import http from 'node:http'
import { setTimeout } from 'node:timers/promises'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { toWebResponse } from '#/test/helpers'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('original response')
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('supports custom delay before responding with a mock', async () => {
  interceptor.once('request', async ({ controller }) => {
    await setTimeout(750)
    controller.respondWith(new Response('mocked response'))
  })

  const requestStart = Date.now()
  const request = http.get('http://non-existing-host.com')
  const [response] = await toWebResponse(request)
  const requestEnd = Date.now()

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('mocked response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})

it('supports custom delay before receiving the original response', async () => {
  interceptor.once('request', async () => {
    // This will simply delay the request execution before
    // it receives the original response.
    await setTimeout(750)
  })

  const requestStart = Date.now()
  const request = http.get(httpServer.http.url('/resource').href)
  const [response] = await toWebResponse(request)
  const requestEnd = Date.now()

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('original response')
  expect(requestEnd - requestStart).toBeGreaterThanOrEqual(700)
})
