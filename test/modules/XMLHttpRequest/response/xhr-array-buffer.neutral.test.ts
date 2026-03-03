// @vitest-environment jsdom
import { toArrayBuffer } from '#/src/utils/bufferUtils'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

const interceptor = new XMLHttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
})

it('responds with a mocked ArrayBuffer response to an HTTP request', async () => {
  const buffer = new TextEncoder().encode('hello world')
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(buffer, { headers: { 'content-type': 'text/plain' } })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'arraybuffer'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.getAllResponseHeaders()).toBe('content-type: text/plain')
  expect.soft(request.response).toEqual(buffer.buffer)
})

it('responds with a mocked ArrayBuffer response to an HTTPS request', async () => {
  const buffer = new TextEncoder().encode('hello world')
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(
      new Response(buffer, { headers: { 'content-type': 'text/plain' } })
    )
  })

  const request = new XMLHttpRequest()
  request.responseType = 'arraybuffer'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect.soft(request.getAllResponseHeaders()).toBe('content-type: text/plain')
  expect.soft(request.response).toEqual(buffer.buffer)
})
