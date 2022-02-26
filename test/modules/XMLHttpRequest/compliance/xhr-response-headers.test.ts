/**
 * @jest-environment jsdom
 */
import { createServer, ServerApi } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(req) {
    if (!req.url.searchParams.has('mock')) {
      return
    }

    return {
      headers: {
        etag: '123',
        'x-response-type': 'mock',
      },
    }
  },
})

beforeAll(async () => {
  httpServer = await createServer((app) => {
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

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
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
    req.open('HEAD', httpServer.http.makeUrl('/'))
    req.send()
  })

  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).toEqual('etag: 456\r\nx-response-type: bypass')
})
