// @vitest-environment node
import http from 'node:http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a request with an empty ReadableStream', async () => {
  interceptor.once('request', ({ controller }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://example.com')
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  await expect(response.text()).resolves.toBe('')
})
