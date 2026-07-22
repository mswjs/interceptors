// @vitest-environment jsdom
/**
 * @note The "jsdom" environment provides the `location` global required
 * to resolve relative request URLs in Node.js. In the browser, this
 * pragma has no effect and the actual page location is used instead.
 */
import { FetchInterceptor } from '@mswjs/interceptors/fetch'

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

it('intercepts a fetch request to a relative URL', async () => {
  interceptor.on('request', ({ controller }) => {
    return controller.respondWith(Response.json([1, 2, 3]))
  })

  const response = await fetch('/numbers')

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual([1, 2, 3])
})
