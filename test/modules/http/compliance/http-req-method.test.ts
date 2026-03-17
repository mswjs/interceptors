// @vitest-environment node
import http from 'node:http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

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

it('supports lowercase HTTP methods', async () => {
  interceptor.on('request', async ({ request, controller }) => {
    if (request.method === 'GET') {
      controller.respondWith(new Response('hello world'))
    }
  })

  /**
   * @note The HTTP specification has no requirement for the request
   * methods to be uppercase. Some Node.js request client, like "chai-http",
   * uses lowercase request methods.
   */
  const request = http
    .request('http://localhost/resource', { method: 'get' })
    .end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  await expect(response.text()).resolves.toBe('hello world')
})
