import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { _ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index-new'

const interceptor = new _ClientRequestInterceptor()

interceptor.on('request', ({ request }) => {
  request.respondWith(Response.error())
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('treats "Response.error()" as a request error', async () => {
  const requestErrorPromise = new DeferredPromise<Error>()

  const request = http.get('http://localhost:3001/resource')

  // In ClientRequest, network errors are forwarded as
  // request errors.
  request.on('error', requestErrorPromise.resolve)
  const requestError = await requestErrorPromise

  expect(requestError).toBeInstanceOf(TypeError)
  expect(requestError.message).toBe('Network error')
})
