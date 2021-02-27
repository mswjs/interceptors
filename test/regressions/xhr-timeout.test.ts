/**
 * @see https://github.com/mswjs/node-request-interceptor/issues/7
 */
import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { createXMLHttpRequest } from '../helpers'

let interceptor: RequestInterceptor

beforeAll(() => {
  interceptor = new RequestInterceptor({
    modules: withDefaultInterceptors,
  })
  interceptor.use(() => {
    // Explicitly empty request middleware so that all requests
    // are bypassed (performed as-is).
  })
})

afterAll(() => {
  interceptor.restore()
})

test('handles XMLHttpRequest timeout via ontimeout callback', async () => {
  expect.assertions(1)

  await createXMLHttpRequest((req) => {
    req.open('GET', 'http://httpbin.org/get?userId=123', true)
    req.timeout = 1
    req.addEventListener('timeout', function () {
      expect(this.readyState).toBe(4)
    })
  })
})

test('handles XMLHttpRequest timeout via event listener', async () => {
  expect.assertions(1)

  await createXMLHttpRequest((req) => {
    req.open('GET', 'http://httpbin.org/get?userId=123', true)
    req.timeout = 1
    req.addEventListener('timeout', function () {
      expect(this.readyState).toBe(4)
    })
  })
})
