// @vitest-environment miniflare
import http from 'node:http'
import https from 'node:https'
import { BatchInterceptor } from '@mswjs/interceptors'
import nodeInterceptors from '@mswjs/interceptors/presets/node'
import { toWebResponse } from '#/test/helpers'

const interceptor = new BatchInterceptor({
  name: 'interceptor',
  interceptors: nodeInterceptors,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('responds to fetch', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const response = await fetch('https://any.host.here/')
  expect(response.status).toEqual(200)
  await expect(response.text()).resolves.toEqual('mocked-body')
})

it('responds to http.get', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const [response] = await toWebResponse(http.get('http://any.host.here/'))
  await expect(response.text()).resolves.toEqual('mocked-body')
})

it('responds to https.get', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('mocked-body'))
  })

  const [response] = await toWebResponse(https.get('https://any.host.here/'))
  await expect(response.text()).resolves.toEqual('mocked-body')
})

it('throws when responding with a network error', async () => {
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
