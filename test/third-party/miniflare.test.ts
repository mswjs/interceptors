// @vitest-environment miniflare
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
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

const requestListener = vi.fn().mockImplementation(({ request }) => {
  request.respondWith(new Response('mocked-body'))
})

interceptor.on('request', requestListener)

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  interceptor.dispose()
})

test('responds to fetch', async () => {
  const response = await fetch('https://example.com')
  expect(response.status).toEqual(200)
  expect(await response.text()).toEqual('mocked-body')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

test('responds to http.get', async () => {
  const { resBody } = await httpGet('http://example.com')
  expect(resBody).toEqual('mocked-body')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

test('responds to https.get', async () => {
  const { resBody } = await httpsGet('https://example.com')
  expect(resBody).toEqual('mocked-body')
  expect(requestListener).toHaveBeenCalledTimes(1)
})

test('throws when responding with a network error', async () => {
  requestListener.mockImplementationOnce(({ request }) => {
    /**
     * @note "Response.error()" static method is NOT implemented in Miniflare.
     * This expression will throw.
     */
    request.respondWith(Response.error())
  })

  const { res, resBody } = await httpGet('http://example.com')

  // Unhandled exceptions in the interceptor are coerced
  // to 500 error responses.
  expect(res.statusCode).toEqual(500)
  expect(res.statusMessage).toEqual('Unhandled Exception')
  expect(JSON.parse(resBody)).toEqual({
    name: 'TypeError',
    message: 'Response.error is not a function',
    stack: expect.any(String),
  })
})
