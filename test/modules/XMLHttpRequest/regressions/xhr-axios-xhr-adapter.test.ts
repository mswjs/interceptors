/**
 * @vitest-environment happy-dom
 * @note This issue is only reproducible in "happy-dom".
 * @see https://github.com/mswjs/msw/issues/1816
 */
import { beforeAll, afterAll, it, expect } from 'vitest'
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'

const request = axios.create({
  baseURL: 'http://localhost',
  adapter: 'xhr',
})

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('performs a request with the "xhr" axios adapter', async () => {
  interceptor.once('request', ({ request }) => {
    request.respondWith(new Response('Hello world'))
  })

  const res = await request('/resource')
  expect(res.status).toBe(200)
  expect(res.data).toBe('Hello world')
})
