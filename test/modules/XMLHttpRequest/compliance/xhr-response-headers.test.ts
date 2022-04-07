/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
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
interceptor.on('request', (request) => {
  if (!request.url.searchParams.has('mock')) {
    return
  }

  request.respondWith({
    headers: {
      etag: '123',
      'x-response-type': 'mock',
    },
  })
})

beforeAll(async () => {
  await httpServer.listen()

  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('retrieves the mocked response headers when called ".getAllResponseHeaders()"', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/?mock=true')
    req.send()
  })

  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).toEqual('etag: 123\r\nx-response-type: mock')
})

test('returns the bypass response headers when called ".getAllResponseHeaders()"', async () => {
  const req = await createXMLHttpRequest((req) => {
    // Perform a HEAD request so that the response has no "Content-Type" header
    // always appended by Express.
    req.open('HEAD', httpServer.http.url('/'))
    req.send()
  })

  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).toEqual('etag: 456\r\nx-response-type: bypass')
})
