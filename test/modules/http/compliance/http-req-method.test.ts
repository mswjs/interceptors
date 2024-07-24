/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

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
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  await expect(text()).resolves.toBe('hello world')
})
