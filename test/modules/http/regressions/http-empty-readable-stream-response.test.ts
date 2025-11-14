// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to a request with an empty ReadableStream', async () => {
  interceptor.on('request', ({ controller }) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close()
      },
    })
    controller.respondWith(new Response(stream))
  })

  const request = http.get('http://example.com')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  await expect(text()).resolves.toBe('')
})
