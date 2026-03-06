// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const server = getTestServer()
const interceptor = new XMLHttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('intercepts a bypassed request with a blob response', async () => {
  const request = new XMLHttpRequest()
  request.responseType = 'blob'
  request.open('POST', server.http.url('/blob'))
  request.send(new Blob(['hello world']))

  await waitForXMLHttpRequest(request)

  expect(request.response).toEqual(new Blob(['hello world']))
})

it('responds with a mocked Blob response to an HTTP request', async () => {
  const blob = new Blob(['hello world'], { type: 'text/plain' })
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(blob))
  })

  const request = new XMLHttpRequest()
  request.responseType = 'blob'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  expect.soft(request.response).toEqual(blob)
})

it('responds with a mocked Blob response to an HTTP request', async () => {
  const blob = new Blob(['hello world'], { type: 'text/plain' })
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response(blob))
  })

  const request = new XMLHttpRequest()
  request.responseType = 'blob'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toContain('content-type: text/plain')
  expect.soft(request.response).toEqual(blob)
})
