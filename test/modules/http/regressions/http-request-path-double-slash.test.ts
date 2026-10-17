// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/871
 */
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

it('preserves the host of a request whose path starts with a double slash', async () => {
  const requestUrlPromise = new Promise<string>((resolve) => {
    interceptor.on('request', ({ request, controller }) => {
      resolve(request.url)
      controller.respondWith(new Response('mocked'))
    })
  })

  const request = http.get('http://example.com//v1/a')
  const [response] = await toWebResponse(request)

  await expect(requestUrlPromise).resolves.toBe('http://example.com//v1/a')
  await expect(response.text()).resolves.toBe('mocked')
})
