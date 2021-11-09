/**
 * @jest-environment jsdom
 */
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../src'
import { interceptXMLHttpRequest } from '../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../helpers'

let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    const shouldMock =
      [httpServer.http.makeUrl(), httpServer.https.makeUrl()].includes(
        request.url.href
      ) || ['/login'].includes(request.url.pathname)

    if (shouldMock) {
      return {
        status: 301,
        statusText: 'Moved Permantently',
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: 'foo',
      }
    }

    if (request.url.href === 'https://error.me/') {
      throw new Error('Custom exception message')
    }
  },
})

beforeAll(async () => {
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  httpServer = await createServer((app) => {
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

  interceptor.apply()
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('responds to an HTTP request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.http.makeUrl('/get'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

test('responds to an HTTPS request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/get'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

test('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.makeUrl('/login'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('content-type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => {
    return createXMLHttpRequest((req) => {
      req.open('GET', 'https://error.me')
    })
  }

  // No way to assert the rejection error, because XMLHttpRequest doesn't propagate it.
  await expect(getResponse()).rejects.toBeTruthy()
})

test('does not propagate the forbidden "cookie" header on the bypassed response', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', httpServer.https.makeUrl('/cookies'))
  })
  const responseHeaders = req.getAllResponseHeaders()
  expect(responseHeaders).not.toMatch(/cookie/)
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/')
})
