// @vitest-environment miniflare
import http from 'node:http'
import https from 'node:https'
import { BatchInterceptor } from '#/src/index'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '#/src/interceptors/fetch'
import { toWebResponse } from '#/test/helpers'

const interceptor = new BatchInterceptor({
  name: 'setup-server',
  interceptors: [
    new HttpRequestInterceptor(),
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

test('responds to fetch', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const response = await fetch('https://any.host.here/')
  expect(response.status).toEqual(200)
  expect(await response.text()).toEqual('mocked-body')
})

test('responds to http.get', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const [response] = await toWebResponse(http.get('http://any.host.here/'))
  await expect(response.text()).resolves.toEqual('mocked-body')
})

test('responds to https.get', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const [response] = await toWebResponse(https.get('https://any.host.here/'))
  await expect(response.text()).resolves.toEqual('mocked-body')
})

test('throws when responding with a network error', async () => {
  interceptor.once('request', ({ controller }) => {
    /**
     * @note "Response.error()" static method is NOT implemented in Miniflare.
     * This expression will throw.
     */
    controller.respondWith(Response.error())
  })

  const [response] = await toWebResponse(http.get('http://any.host.here/'))

  // Unhandled exceptions in the interceptor are coerced
  // to 500 error responses.
  expect(response.status).toBe(500)
  expect(response.statusText).toBe('Unhandled Exception')
  await expect(response.json()).resolves.toEqual({
    name: 'TypeError',
    message: 'Response.error is not a function',
    stack: expect.any(String),
  })
})
