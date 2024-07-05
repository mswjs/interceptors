/**
 * @vitest-environment happy-dom
 * @note This issue is only reproducible in "happy-dom".
 * @see https://github.com/mswjs/msw/issues/1816
 */
import { beforeAll, afterAll, it, expect } from 'vitest'
import axios from 'axios'
/**
 * @note Use `Response` from Undici because "happy-dom"
 * does not implement ReadableStream at all. They use
 * Node's Readable instead, which is completely incompatible.
 */
import { Response as UndiciResponse } from 'undici'
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
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(
      new UndiciResponse('Hello world') as unknown as Response
    )
  })

  const res = await request('/resource')
  expect(res.status).toBe(200)
  expect(res.data).toBe('Hello world')
})
