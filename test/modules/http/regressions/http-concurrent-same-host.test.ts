/**
 * @vitest-environment node
 * @see https://github.com/mswjs/interceptors/issues/2
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

let requests: Array<Request> = []

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  requests.push(request)
  controller.respondWith(new Response())
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

it('resolves multiple concurrent requests to the same host independently', async () => {
  await Promise.all([
    promisifyClientRequest(() => {
      return http.get('http://httpbin.org/get')
    }),
    // promisifyClientRequest(() => {
    //   return http.get('http://httpbin.org/get?header=abc', {
    //     headers: { 'x-custom-header': 'abc' },
    //   })
    // }),
    // promisifyClientRequest(() => {
    //   return http.get('http://httpbin.org/get?header=123', {
    //     headers: { 'x-custom-header': '123' },
    //   })
    // }),
  ])

  for (const request of requests) {
    const url = new URL(request.url)
    const expectedHeaderValue = url.searchParams.get('header')

    if (expectedHeaderValue) {
      expect(request.headers.get('x-custom-header')).toBe(expectedHeaderValue)
    } else {
      expect(request.headers.has('x-custom-header')).toBe(false)
    }
  }
})
