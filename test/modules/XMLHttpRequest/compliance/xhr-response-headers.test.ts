// @vitest-environment happy-dom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (_req, res) => {
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

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('returns the bypass response headers when called ".getAllResponseHeaders()"', async () => {
  const request = new XMLHttpRequest()
  request.open('GET', httpServer.http.url('/'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.getAllResponseHeaders()).toContain(
    'etag: 456\r\nx-response-type: bypass'
  )
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
