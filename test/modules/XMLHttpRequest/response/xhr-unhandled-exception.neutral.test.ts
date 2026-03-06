// @vitest-environment happy-dom
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

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

it('treats an unhandled exception as a 500 response for an HTTP request', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error message')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(500)
  expect.soft(request.statusText).toBe('Unhandled Exception')
  expect.soft(request.response).toEqual({
    name: 'Error',
    message: 'Custom error message',
    stack: expect.any(String),
  })
})

it('treats an unhandled exception as a 500 response for an HTTPS request', async () => {
  interceptor.on('request', () => {
    throw new Error('Custom error message')
  })

  const request = new XMLHttpRequest()
  request.responseType = 'json'
  request.open('GET', 'https://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect.soft(request.status).toBe(500)
  expect.soft(request.statusText).toBe('Unhandled Exception')
  expect.soft(request.response).toEqual({
    name: 'Error',
    message: 'Custom error message',
    stack: expect.any(String),
  })
})
