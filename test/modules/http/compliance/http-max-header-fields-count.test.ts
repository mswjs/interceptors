// @vitest-environment node
import http from 'node:http'
import { afterAll, afterEach, beforeAll, it, expect } from 'vitest'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'
import { DeferredPromise } from '@open-draft/deferred-promise'

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

it('supports requests with more than default maximum header fields count', async () => {
  const requestHeadersPromise = new DeferredPromise<Headers>()

  interceptor.on('request', ({ request, controller }) => {
    requestHeadersPromise.resolve(request.headers)
    controller.respondWith(new Response())
  })

  const request = http.request('http://localhost/irrelevant')

  /**
   * By default, Node.js HTTP parser defines 32 as the maximum header fields count.
   * Each request also has "connection" and "host" headers added automatically.
   * @see https://github.com/nodejs/node/blob/229cc3be28eab3153c16bc55bc67d1e81c4a7067/src/node_http_parser.cc#L83-L84
   */
  const headersPairs = Array.from({ length: 60 })
    .map<[string, string]>((_, index) => {
      return [`x-header-${index}`, index.toString()]
    })
    .sort()
  request.setHeaders(new Headers(headersPairs))
  request.end()

  await waitForClientRequest(request)
  const requestHeaders = await requestHeadersPromise

  expect(Array.from(requestHeaders)).toEqual([
    ['connection', 'close'],
    ['host', 'localhost'],
    ...headersPairs,
  ])
})

it('supports multiple parallel "slow" requests', async () => {
  // Perform multiple slow requests to ensure their buffered headers don't overlap.
  for (let requestIndex = 0; requestIndex < 5; requestIndex++) {
    const requestHeadersPromise = new DeferredPromise<Headers>()

    interceptor.on('request', ({ request, controller }) => {
      if (request.url === `http://localhost/${requestIndex}`) {
        requestHeadersPromise.resolve(request.headers)
        controller.respondWith(new Response())
      }
    })

    const request = http.request(`http://localhost/${requestIndex}`)

    const headersPairs = Array.from({ length: 60 })
      .map<[string, string]>((_, index) => {
        return [
          `x-request-${requestIndex}-header-${index}`,
          requestIndex.toString() + index.toString(),
        ]
      })
      .sort()
    request.setHeaders(new Headers(headersPairs))
    request.end()

    await waitForClientRequest(request)
    const requestHeaders = await requestHeadersPromise

    expect(Array.from(requestHeaders)).toEqual([
      ['connection', 'close'],
      ['host', 'localhost'],
      ...headersPairs,
    ])
  }
})

it('supports responses with more than default maximum header fields count', async () => {
  const responseHeadersPromise = new DeferredPromise<Headers>()

  const responseHeadersPairs = Array.from({ length: 60 })
    .map<[string, string]>((_, index) => {
      return [`x-response-header-${index}`, index.toString()]
    })
    .sort()

  interceptor.on('request', ({ controller }) => {
    const response = new Response(null, {
      status: 200,
      headers: new Headers(responseHeadersPairs)
    })
    
    controller.respondWith(response)
  })

  interceptor.on('response', ({ response }) => {
    responseHeadersPromise.resolve(response.headers)
  })

  const request = http.get('http://localhost/irrelevant')
  request.end()

  await waitForClientRequest(request)
  const responseHeaders = await responseHeadersPromise

  expect(Array.from(responseHeaders)).toEqual(responseHeadersPairs)
})
