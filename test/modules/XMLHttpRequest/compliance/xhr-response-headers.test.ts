// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'

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
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', '/?mock=true')
    req.send()
  })

  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).toEqual('etag: 123\r\nx-response-type: mock')
})

it('returns the bypass response headers when called ".getAllResponseHeaders()"', async () => {
  const req = await createXMLHttpRequest((req) => {
    // Perform a HEAD request so that the response has no "Content-Type" header
    // always appended by Express.
    req.open('HEAD', httpServer.http.url('/'))
    req.send()
  })

  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).toEqual('etag: 456\r\nx-response-type: bypass')
})
