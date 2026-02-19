// @vitest-environment node
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { waitForClientRequest } from '../../../helpers'
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
  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  expect.soft(res.headers).toHaveProperty('transfer-encoding', 'chunked')
  expect.soft(res.rawHeaders).toContain('Transfer-Encoding')
  await expect(text()).resolves.toBe('hello world')
})
