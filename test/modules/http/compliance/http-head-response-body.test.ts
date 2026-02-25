// @vitest-environment node
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('ignores response body in a mocked response to a HEAD request', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'x-custom-header': 'yes',
        },
      })
    )
  })

  const request = http.request('http://example.com', { method: 'HEAD' }).end()
  const [response] = await toWebResponse(request)

  expect(response.status).toBe(200)
  expect(response.headers.get('x-custom-header')).toBe('yes')
  await expect(response.text(), 'Ignores the response body').resolves.toBe('')
})
