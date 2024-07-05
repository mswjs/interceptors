/**
 * @vitest-environment jsdom
 */
import { it, expect, afterAll, afterEach, beforeAll } from 'vitest'
import { FetchInterceptor } from '../../../../src/interceptors/fetch'

const interceptor = new FetchInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a fetch request to a relative URL (jsdom)', async () => {
  interceptor.on('request', ({ controller }) => {
    return controller.respondWith(Response.json([1, 2, 3]))
  })

  const response = await fetch('/numbers')

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([1, 2, 3])
})
