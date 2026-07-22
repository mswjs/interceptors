/**
 * @vitest-environment node
 * @see https://github.com/mswjs/interceptors/issues/131
 */
import https from 'node:https'
import { URL } from 'node:url'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

let httpServer: TestHttpServer
const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('hello')
      })
    },
  })
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('performs the original HTTPS request', async () => {
  const request = https
    .request(new URL(httpServer.https.url('/resource').href), {
      method: 'GET',
      rejectUnauthorized: false,
    })
    .end()

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect(response.text()).resolves.toEqual('hello')
})
