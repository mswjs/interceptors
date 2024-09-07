/**
 * @vitest-environment node
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const interceptor = new ClientRequestInterceptor()

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
  const { res, text } = await waitForClientRequest(request)

  // Must return the correct mocked response.
  expect(res.statusCode).toBe(200)
  expect(res.headers).toHaveProperty('x-custom-header', 'yes')
  // Must ignore the response body.
  expect(await text()).toBe('')
})
