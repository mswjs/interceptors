/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('supports responding with an empty mocked response', async () => {
  interceptor.once('request', ({ request, controller }) => {
    // Responding with an empty response must translate to 200 OK with an empty body.
    controller.respondWith(new Response())
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  // Must not set any response headers that were not
  // explicitly provided in the mocked response.
  expect.soft(res.headers).toEqual({})
  expect.soft(res.rawHeaders).toEqual([])
  await expect(text()).resolves.toBe('')
})
