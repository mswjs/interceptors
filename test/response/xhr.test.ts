import { ServerApi, createServer } from '@open-draft/test-server'
import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { createXMLHttpRequest } from '../helpers'

let interceptor: RequestInterceptor
let server: ServerApi

beforeAll(async () => {
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  server = await createServer((app) => {
    app.get('/', (req, res) => {
      res.status(200).send('/').end()
    })
    app.get('/get', (req, res) => {
      res.status(200).send('/get').end()
    })
  })

  interceptor = new RequestInterceptor(withDefaultInterceptors)
  interceptor.use((req) => {
    const shouldMock =
      [server.http.makeUrl(), server.https.makeUrl()].includes(req.url.href) ||
      ['/login'].includes(req.url.pathname)

    if (shouldMock) {
      return {
        status: 301,
        headers: {
          'Content-Type': 'application/hal+json',
        },
        body: 'foo',
      }
    }

    if (req.url.href === 'https://error.me/') {
      throw new Error('Custom exception message')
    }
  })
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('responds to an HTTP request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('Content-Type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/get'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

test('responds to an HTTPS request handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.https.makeUrl('/'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('Content-Type: application/hal+json')
  expect(req.response).toEqual('foo')
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.https.makeUrl('/get'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/get')
})

test('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const req = await createXMLHttpRequest((req) => {
    req.open('POST', server.https.makeUrl('/login'))
  })
  const responseHeaders = req.getAllResponseHeaders()

  expect(req.status).toEqual(301)
  expect(responseHeaders).toContain('Content-Type: application/hal+json')
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

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const req = await createXMLHttpRequest((req) => {
    req.open('GET', server.https.makeUrl('/'))
  })

  expect(req.status).toEqual(200)
  expect(req.response).toEqual('/')
})
