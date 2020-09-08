import { RequestInterceptor } from '../../src'
import withDefaultInterceptors from '../../src/presets/default'
import { ServerAPI, createServer } from '../utils/createServer'

interface XhrResponse {
  status: number
  headers: string
  body: string
}

function performXMLHttpRequest(
  method: string,
  url: string
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest()
    let status: number
    let headers: string
    let body: string

    req.onload = () => {
      body = req.response
      headers = req.getAllResponseHeaders()
      status = req.status
      resolve({ status, headers, body })
    }
    req.onerror = reject
    req.open(method, url)
    req.send()
  })
}

let interceptor: RequestInterceptor
let server: ServerAPI

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
      [server.getHttpAddress(), server.getHttpsAddress()].includes(
        req.url.href
      ) || ['/login'].includes(req.url.pathname)

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
  const res = await performXMLHttpRequest('GET', server.makeHttpUrl('/'))

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', server.makeHttpUrl('/get'))

  expect(res.status).toEqual(200)
  expect(res.body).toEqual('/get')
})

test('responds to an HTTPS request handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', server.makeHttpsUrl('/'))

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', server.makeHttpsUrl('/get'))

  expect(res.status).toEqual(200)
  expect(res.body).toEqual('/get')
})

test('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const res = await performXMLHttpRequest('POST', '/login')

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('produces a request error when the middleware throws an exception', async () => {
  const getResponse = () => {
    return performXMLHttpRequest('GET', 'https://error.me')
  }

  // No way to assert the rejection error, because XMLHttpRequest doesn't propagate it.
  await expect(getResponse()).rejects.toBeTruthy()
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const res = await performXMLHttpRequest('GET', server.makeHttpsUrl('/'))

  expect(res.status).toEqual(200)
  expect(res.body).toEqual('/')
})
