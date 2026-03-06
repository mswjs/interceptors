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

it('intercepts a bypassed request with a JSON response', async () => {
  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('POST', server.http.url('/empty'))
  request.send(JSON.stringify({ name: 'John Maverick' }))

  await waitForXMLHttpRequest(request)

  expect(request.response).toEqual({ name: 'John Maverick' })
})

it('responds with a mocked text response to an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ name: 'John Maverick' }))
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toBe('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })
})

it('responds with a mocked text response to an HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.json({ name: 'John Maverick' }))
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(200)
  expect
    .soft(request.getAllResponseHeaders().toLowerCase())
    .toBe('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })
})
