/**
 * @see https://github.com/mswjs/node-request-interceptor/issues/7
 */
import { RequestInterceptor } from '../../src'

const interceptor = new RequestInterceptor()

beforeAll(() => {
  interceptor.use(() => {
    // Explicitly empty request middleware so that all requests
    // are bypassed (performed as-is).
  })
})

afterAll(() => {
  interceptor.restore()
})

test('handles XMLHttpRequest timeout via ontimeout callback', (done) => {
  const req = new XMLHttpRequest()
  req.timeout = 1
  req.ontimeout = function () {
    expect(this.readyState).toBe(4)
    done()
  }
  req.open('GET', 'http://httpbin.org/get?userId=123', true)
  req.send()
})

test('handles XMLHttpRequest timeout via event listener', (done) => {
  const req = new XMLHttpRequest()
  req.timeout = 1
  req.addEventListener('timeout', function () {
    expect(this.readyState).toBe(4)
    done()
  })
  req.open('GET', 'http://httpbin.org/get?userId=123', true)
  req.send()
})
