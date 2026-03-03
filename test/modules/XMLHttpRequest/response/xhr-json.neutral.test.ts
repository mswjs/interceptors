// @vitest-environment jsdom
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
    .soft(request.getAllResponseHeaders())
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
    .soft(request.getAllResponseHeaders())
    .toBe('content-type: application/json')
  expect.soft(request.response).toEqual({ name: 'John Maverick' })
})
