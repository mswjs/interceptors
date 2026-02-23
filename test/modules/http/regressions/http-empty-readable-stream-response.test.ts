/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { waitForClientRequest } from '../../../helpers'

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
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.statusMessage).toBe('OK')
  expect(await text()).toBe('')
})
