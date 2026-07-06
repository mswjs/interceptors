// @vitest-environment happy-dom
/**
 * @note This issue is only reproducible in "happy-dom".
 * @see https://github.com/mswjs/msw/issues/1816
 */
import axios from 'axios'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

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

it('performs a request with the "xhr" axios adapter', async ({ task }) => {
  interceptor.once('request', async ({ controller }) => {
    if (task.file.projectName === 'browser') {
      controller.respondWith(new Response('Hello world'))
      return
    }

    /**
     * @note Use `Response` from Undici in Node.js because "happy-dom"
     * does not implement ReadableStream at all. They use
     * Node's Readable instead, which is completely incompatible.
     */
    const { Response: UndiciResponse } = await import('undici')
    controller.respondWith(
      new UndiciResponse('Hello world') as unknown as Response
    )
  })

  const response = await request('/resource')
  expect.soft(response.status).toBe(200)
  expect.soft(response.data).toBe('Hello world')
})
