// @vitest-environment jsdom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { useCors, waitForXMLHttpRequest } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.head('/', (_req, res) => {
    res
      .set({
        // Specify which response headers to expose to the client.
        'Access-Control-Expose-Headers': 'etag, x-response-type',
        etag: '456',
        'x-response-type': 'bypass',
      })
      .end()
  })
})

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  if (!url.searchParams.has('mock')) {
    return
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

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('retrieves the mocked response headers when called ".getAllResponseHeaders()"', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', '/?mock=true')
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getAllResponseHeaders()).toBe(
    'etag: 123\r\nx-response-type: mock'
  )
})

it('returns the bypass response headers when called ".getAllResponseHeaders()"', async () => {
  const request = new XMLHttpRequest()
  // Perform a HEAD request so that the response has no "Content-Type" header
  // always appended by Express.
  request.open('HEAD', httpServer.http.url('/'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getAllResponseHeaders()).toBe(
    'etag: 456\r\nx-response-type: bypass'
  )
})
