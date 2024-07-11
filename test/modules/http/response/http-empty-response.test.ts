/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports responding with an empty mocked response', async () => {
  interceptor.once('request', ({ controller }) => {
    // Responding with an empty response must
    // translate to 200 OK with an empty body.
    controller.respondWith(new Response())
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  // Must not set any response headers that were not
  // explicitly provided in the mocked response.
  expect(res.headers).toEqual({})
  expect(res.rawHeaders).toEqual([])
  expect(await text()).toBe('')
})
