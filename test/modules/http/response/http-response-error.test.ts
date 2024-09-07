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

  // Must handle Response.error() as a network error.
  await vi.waitFor(() => {
    expect(requestErrorListener).toHaveBeenNthCalledWith(
      1,
      new TypeError('Network error')
    )
  })

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
  await vi.waitFor(() => {
    expect(requestErrorListener).toHaveBeenNthCalledWith(
      1,
      new TypeError('Network error')
    )
  })

  expect(responseListener).not.toHaveBeenCalled()
})
