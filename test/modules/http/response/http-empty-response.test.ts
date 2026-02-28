// @vitest-environment node
import http from 'node:http'
import { toWebResponse } from '../../../helpers'
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
  const [response, rawResponse] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  // Must not set any response headers that were not
  // explicitly provided in the mocked response.
  expect.soft(Object.fromEntries(response.headers)).toEqual({})
  expect.soft(rawResponse.rawHeaders).toEqual([])
  await expect(response.text()).resolves.toBe('')
})
