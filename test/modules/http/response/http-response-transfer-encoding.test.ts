// @vitest-environment node
import http from 'node:http'
import { toWebResponse } from '../../../helpers'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'

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

it('responds with a mocked "transfer-encoding: chunked" response', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('hello world', {
        headers: {
          'Content-Type': 'text/plain',
          'Transfer-Encoding': 'chunked',
        },
      })
    )
  })

  const request = http.get('http://localhost')
  const [response, rawResponse] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  expect.soft(response.headers.get('transfer-encoding')).toBe('chunked')
  expect.soft(rawResponse.rawHeaders).toContain('Transfer-Encoding')
  await expect(response.text()).resolves.toBe('hello world')
})
