/**
 * @jest-environment jsdom
 */
import { HttpServer } from '@open-draft/test-server/http'
import { Response } from '@remix-run/web-fetch'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'

declare namespace window {
  export const _resourceLoader: {
    _strictSSL: boolean
  }
}

const httpServer = new HttpServer((app) => {
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
interceptor.on('request', (request) => {
  const url = new URL(request.url)

  const shouldMock =
    [httpServer.http.url(), httpServer.https.url()].includes(request.url) ||
    ['/login'].includes(url.pathname)

  if (shouldMock) {
    return request.respondWith(
      new Response('foo', {
        status: 301,
        statusText: 'Moved Permantently',
        headers: {
          'Content-Type': 'application/hal+json',
        },
      })
    )
  }

  if (request.url === 'https://error.me/') {
    throw new Error('Custom exception message')
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
  jest.restoreAllMocks()
})

test('responds to an HTTP request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.url('/get'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

test('responds to an HTTPS request handled in the middleware', async () => {
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

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/get'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
  expect(req.responseURL).toEqual(httpServer.https.url('/get'))
})

test('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
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

test('produces a request error when the middleware throws an exception', async () => {
  const errorListener = jest.fn()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', 'https://error.me')
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

test('does not propagate the forbidden "cookie" header on the bypassed response', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.url('/cookies'))
    req.send()
  })
  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).not.toMatch(/cookie/)
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.dispose()

  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.url('/'))
    req.send()
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/')
  expect(req.responseURL).toEqual(httpServer.https.url('/'))
})
