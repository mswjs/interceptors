// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const interceptor = new ClientRequestInterceptor()

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
      message: 'Handles Response.erorr() as a request error',
    })
    .toHaveBeenNthCalledWith(1, new TypeError('Network error'))

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

  await expect
    .poll(() => requestErrorListener, {
      message: 'Handles Response.error() as a request error',
    })
    .toHaveBeenCalledWith(new TypeError('Network error'))

  expect.soft(requestErrorListener).toHaveBeenCalledOnce()
  expect.soft(responseListener).not.toHaveBeenCalled()
})
