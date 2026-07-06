// @vitest-environment happy-dom
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
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

it('returns the bypass response headers when called ".getAllResponseHeaders()"', async () => {
  // The test server echoes the request headers in the response.
  const request = new XMLHttpRequest()
  request.open('GET', server.http.url('/'))
  request.setRequestHeader('x-custom-etag', '456')
  request.setRequestHeader('x-response-type', 'bypass')
  request.send()

  await waitForXMLHttpRequest(request)

  const allResponseHeaders = request.getAllResponseHeaders()
  expect(allResponseHeaders).toContain('x-custom-etag: 456')
  expect(allResponseHeaders).toContain('x-response-type: bypass')
})

it('retrieves the mocked response headers when called ".getAllResponseHeaders()"', async () => {
  interceptor.on('request', ({ request, controller }) => {
    if (request.method === 'OPTIONS') {
      return controller.respondWith(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'etag, x-response-type',
          },
        })
      )
    }

    controller.respondWith(
      new Response(null, {
        headers: {
          etag: '123',
          'x-response-type': 'mock',
        },
      })
    )
  })

  const request = new XMLHttpRequest()
  request.open('GET', 'http://any.host.here/irrelevant')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getAllResponseHeaders()).toBe(
    'etag: 123\r\nx-response-type: mock'
  )
})
