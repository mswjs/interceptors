// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'

const interceptor = new HttpRequestInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('treats "Response.error()" as a network error', async () => {
  const requestErrorListener = vi.fn()
  const responseListener = vi.fn()

  interceptor.on('request', ({ controller }) => {
    controller.respondWith(Response.error())
  })
  interceptor.on('response', responseListener)

  const request = http.get('http://localhost:3001/resource')
  request.on('error', requestErrorListener)

  await expect
    .poll(() => requestErrorListener, {
      message: 'Must treat Response.error() as a network error',
    })
    .toHaveBeenCalledWith(new TypeError('Network error'))
  expect(requestErrorListener).toHaveBeenCalledOnce()

  expect(responseListener).not.toHaveBeenCalled()
})

it('treats a thrown Response.error() as a network error', async () => {
  const requestErrorListener = vi.fn()
  const responseListener = vi.fn()

  interceptor.on('request', () => {
    throw Response.error()
  })
  interceptor.on('response', responseListener)

  const request = http.get('http://localhost:3001/resource')
  request.on('error', requestErrorListener)

  // Must handle Response.error() as a request error.
  await expect
    .poll(() => requestErrorListener, {
      message: 'Must treat Response.error() as a network error',
    })
    .toHaveBeenCalledWith(new TypeError('Network error'))
  expect(requestErrorListener).toHaveBeenCalledOnce()

  expect(responseListener).not.toHaveBeenCalled()
})
