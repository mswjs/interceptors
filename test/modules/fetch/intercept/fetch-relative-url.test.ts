/**
 * @vitest-environment jsdom
 */
import { it, expect, afterAll, beforeAll } from 'vitest'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()
interceptor.once('request', ({ request }) => {
  if (request.url.endsWith('/numbers')) {
    return request.respondWith(Response.json([1, 2, 3]))
  }
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a fetch request to a relative URL', async () => {
  const response = await fetch('/numbers')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([1, 2, 3])
})
