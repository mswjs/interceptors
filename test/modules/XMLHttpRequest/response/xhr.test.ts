// @vitest-environment jsdom
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest'
import { useCors } from '#/test/helpers'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.get('/', (req, res) => {
    res.status(200).send('/')
  })
  app.get('/get', (req, res) => {
    res.status(200).send('/get')
  })
  app.post('/cookies', (req, res) => {
    return res
      .cookie('authToken', 'SECRET', {
        secure: true,
        expires: new Date(Date.now() + 90000),
      })
      .send('ok')
  })
})

const interceptor = new XMLHttpRequestInterceptor()
interceptor.on('request', ({ request, controller }) => {
  const url = new URL(request.url)

  const shouldMock =
    [httpServer.http.url(), httpServer.https.url()].includes(request.url) ||
    ['/login'].includes(url.pathname)

  if (shouldMock) {
    return controller.respondWith(
      new Response('foo', {
        status: 301,
        statusText: 'Moved Permanently',
        headers: {
          'Content-Type': 'application/hal+json',
        },
      })
    )
  }

  if (request.url.endsWith('/network-error')) {
    return controller.respondWith(Response.error())
  }

  if (request.url.endsWith('/exception')) {
    throw new Error('Custom message')
  }
})

beforeAll(async () => {
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  await httpServer.listen()
  interceptor.apply()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
  vi.restoreAllMocks()
})

it('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const request = new XMLHttpRequest()
  request.open('POST', httpServer.https.url('/login'))
  request.send()

  await waitForXMLHttpRequest(request)
  const responseHeaders = request.getAllResponseHeaders()

  expect(request.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(request.response).toEqual('foo')
  expect(request.responseURL).toEqual(httpServer.https.url('/login'))
})

it('does not propagate the forbidden "cookie" header on the bypassed response', async () => {
  const request = new XMLHttpRequest()
  request.open('POST', httpServer.https.url('/cookies'))
  request.send()

  await waitForXMLHttpRequest(request)
  const responseHeaders = request.getAllResponseHeaders()
  expect(responseHeaders).not.toMatch(/cookie/)
})

it('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()

  const request = new XMLHttpRequest()
  request.open('GET', httpServer.https.url('/'))
  request.send()

  await waitForXMLHttpRequest(request)

  expect(request.status).toEqual(200)
  expect(request.response).toEqual('/')
  expect(request.responseURL).toEqual(httpServer.https.url('/'))
})
