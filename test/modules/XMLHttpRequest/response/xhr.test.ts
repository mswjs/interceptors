// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors } from '../../../helpers'

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

it('responds to an HTTP request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
})

it('bypasses an HTTP request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/get'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

it('responds to an HTTPS request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
  expect(req.responseURL).toEqual(httpServer.https.url('/'))
})

it('bypasses an HTTPS request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/get'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
  expect(req.responseURL).toEqual(httpServer.https.url('/get'))
})

it('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.url('/login'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
  expect(req.responseURL).toEqual(httpServer.https.url('/login'))
})

it('produces a request error for a mocked Response.error() response', async () => {
  const errorListener = vi.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', 'http://localhost/network-error')
    req.addEventListener('error', errorListener)
    req.send()
  })

  expect(errorListener).toHaveBeenCalledTimes(1)

  // XMLHttpRequest request exception propagates as "ProgressEvent".
  const [progressEvent] = errorListener.mock.calls[0]
  expect(progressEvent).toBeInstanceOf(ProgressEvent)

  // Request must still exist.
  expect(req.status).toBe(0)
})

it('produces a 500 response for an unhandled exception in the interceptor', async () => {
  const request = await createXMLHttpRequest((request) => {
    request.responseType = 'json'
    request.open('GET', 'http://localhost/exception')
    request.send()
  })

  expect(request.status).toBe(500)
  expect(request.statusText).toBe('Unhandled Exception')
  expect(request.response).toEqual({
    name: 'Error',
    message: 'Custom message',
    stack: expect.any(String),
  })
})

it('does not propagate the forbidden "cookie" header on the bypassed response', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.url('/cookies'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).not.toMatch(/cookie/)
})

it('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()

  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/')
  expect(req.responseURL).toEqual(httpServer.https.url('/'))
})
