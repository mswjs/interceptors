// @vitest-environment miniflare
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { BatchInterceptor } from '../../src'
import { ClientRequestInterceptor } from '../../src/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '../../src/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '../../src/interceptors/fetch'
import { httpGet, httpsGet } from '../helpers'

const interceptor = new BatchInterceptor({
  name: 'setup-server',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.clearAllMocks()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to fetch', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const response = await fetch('http://localhost/resource')
  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('mocked-body')
})

it('responds to http.get', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const { resBody } = await httpGet('http://localhost/resource')
  expect(resBody).toBe('mocked-body')
})

it('responds to https.get', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const { resBody } = await httpsGet('https://localhost/resource')
  expect(resBody).toBe('mocked-body')
})

it('throws when responding with a network error', async () => {
  interceptor.on('request', ({ controller }) => {
    /**
     * @note "Response.error()" static method is NOT implemented in Miniflare.
     * This expression will throw.
     */
    controller.respondWith(Response.error())
  })

  const { res, resBody } = await httpGet('http://localhost/resource')

  // Unhandled exceptions in the interceptor are coerced
  // to 500 error responses.
  expect.soft(res.statusCode).toBe(500)
  expect.soft(res.statusMessage).toBe('Unhandled Exception')
  expect.soft(JSON.parse(resBody)).toEqual({
    name: 'TypeError',
    message: 'Response.error is not a function',
    stack: expect.any(String),
  })
})
