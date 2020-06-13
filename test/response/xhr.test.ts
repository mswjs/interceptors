import { RequestInterceptor } from '../../src'

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

beforeAll(() => {
  interceptor = new RequestInterceptor()
  interceptor.use((req) => {
    const shouldMock =
      ['https://test.msw.io', 'http://test.msw.io'].includes(req.url.origin) ||
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
  })
})

afterAll(() => {
  interceptor.restore()
})

test('responds to an HTTP request handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', 'http://test.msw.io')

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('bypasses an HTTP request not handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', 'http://httpbin.org/get')

  expect(res.status).toEqual(200)
  expect(res.body).toContain(`\"url\": \"http://httpbin.org/get\"`)
})

test('responds to an HTTPS request handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', 'https://test.msw.io')

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('bypasses an HTTPS request not handled in the middleware', async () => {
  const res = await performXMLHttpRequest('GET', 'https://httpbin.org/get')

  expect(res.status).toEqual(200)
  expect(res.body).toContain(`\"url\": \"https://httpbin.org/get\"`)
})

test('responds to an HTTP request to a relative URL that is handled in the middleware', async () => {
  const res = await performXMLHttpRequest('POST', '/login')

  expect(res.status).toEqual(301)
  expect(res.headers).toContain('Content-Type: application/hal+json')
  expect(res.body).toEqual('foo')
})

test('bypasses any request when the interceptor is restored', async () => {
  interceptor.restore()
  const res = await performXMLHttpRequest('GET', 'https://httpbin.org/get')

  expect(res.status).toEqual(200)
  expect(res.body).toContain(`\"url\": \"https://httpbin.org/get\"`)
})
