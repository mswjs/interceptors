/**
 * @jest-environment node
 * @see https://github.com/mswjs/interceptors/issues/2
 */
import * as http from 'http'
import { IsomorphicRequest } from '../../../../src'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

let requests: IsomorphicRequest[] = []

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', (request) => {
  requests.push(request)
  request.respondWith({
    status: 200,
  })
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(() => {
  interceptor.dispose()
})

function promisifyClientRequest(
  getRequest: () => http.ClientRequest
): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = getRequest()
    request.once('aborted', reject)
    request.once('error', reject)
    request.once('response', resolve)
  })
}

test('resolves multiple concurrent requests to the same host independently', async () => {
  await Promise.all([
    promisifyClientRequest(() => {
      return http.get('http://httpbin.org/get')
    }),
    promisifyClientRequest(() => {
      return http.get('http://httpbin.org/get?header=abc', {
        headers: { 'x-custom-header': 'abc' },
      })
    }),
    promisifyClientRequest(() => {
      return http.get('http://httpbin.org/get?header=123', {
        headers: { 'x-custom-header': '123' },
      })
    }),
  ])

  for (const request of requests) {
    const expectedHeaderValue = request.url.searchParams.get('header')

    if (expectedHeaderValue) {
      expect(request.headers.get('x-custom-header')).toEqual(
        expectedHeaderValue
      )
    } else {
      expect(request.headers.has('x-custom-header')).toEqual(false)
    }
  }
})
