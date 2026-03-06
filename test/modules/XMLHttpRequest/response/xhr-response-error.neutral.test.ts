// @vitest-environment happy-dom
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

it('treats Response.error() as a request error for an HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const errorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.addEventListener('error', errorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')
  expect.soft(errorListener).toHaveBeenCalledTimes(1)
})

it('treats Response.error() as a request error for an HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })

  const errorListener = vi.fn()
  const request = new XMLHttpRequest()
  request.open('GET', 'https://any.host.here/irrelevant')
  request.addEventListener('error', errorListener)
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(0)
  expect.soft(request.statusText).toBe('')
  expect.soft(request.response).toBe('')
  expect.soft(errorListener).toHaveBeenCalledTimes(1)
})
