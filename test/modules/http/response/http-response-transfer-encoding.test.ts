// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'

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

it('responds with a mocked "transfer-encoding: chunked" respon se', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response('mock', {
        headers: { 'Transfer-Encoding': 'chunked' },
      })
    )
  })

  const request = http.get('http://localhost')
  const { res, text } = await waitForClientRequest(request)

  expect(res.statusCode).toBe(200)
  expect(res.headers).toHaveProperty('transfer-encoding', 'chunked')
  expect(res.rawHeaders).toContain('Transfer-Encoding')
  expect(await text()).toBe('mock')
})
