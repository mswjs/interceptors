/**
 * @jest-environment jsdom
 */
import { Headers } from 'headers-utils'
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptXMLHttpRequest } from '../../../../src/interceptors/XMLHttpRequest'
import { findRequest, createXMLHttpRequest } from '../../../helpers'
import { IsomorphicRequest } from '../../../../src/createInterceptor'

function lookupRequest(
  req: XMLHttpRequest,
  method: string,
  requests: IsomorphicRequest[]
): IsomorphicRequest | undefined {
  return findRequest(requests, method, req.responseURL)
}

let requests: IsomorphicRequest[] = []
let httpServer: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    requests.push(request)
  },
})

beforeAll(async () => {
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  httpServer = await createServer((app) => {
    const handleUserRequest: RequestHandler = (_req, res) => {
      res.status(200).send('user-body').end()
    }

    app.get('/user', handleUserRequest)
    app.post('/user', handleUserRequest)
    app.put('/user', handleUserRequest)
    app.delete('/user', handleUserRequest)
    app.patch('/user', handleUserRequest)
    app.head('/user', handleUserRequest)
  })

  interceptor.apply()
})

afterEach(() => {
  requests = []
})

afterAll(async () => {
  interceptor.restore()
  await httpServer.close()
})

test('intercepts an HTTP HEAD request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'HEAD', requests)!!

  expect(capturedRequest.method).toEqual('HEAD')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP GET request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', url)
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', requests)!

  expect(capturedRequest.method).toEqual('GET')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP POST request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })
  const capturedRequest = lookupRequest(originalRequest, 'POST', requests)!

  expect(capturedRequest.method).toEqual('POST')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
  expect(capturedRequest.body).toEqual('post-payload')
})

test('intercepts an HTTP PUT request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PUT', requests)!

  expect(capturedRequest.method).toEqual('PUT')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
  expect(capturedRequest.body).toEqual('put-payload')
})

test('intercepts an HTTP DELETE request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'DELETE', requests)!

  expect(capturedRequest.method).toEqual('DELETE')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS HEAD request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('HEAD', url)
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'HEAD', requests)!

  expect(capturedRequest.method).toEqual('HEAD')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS GET request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', requests)!

  expect(capturedRequest.method).toEqual('GET')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS POST request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('post-payload')
  })
  const capturedRequest = lookupRequest(originalRequest, 'POST', requests)!

  expect(capturedRequest.method).toEqual('POST')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
  expect(capturedRequest.body).toEqual('post-payload')
})

test('intercepts an HTTPS PUT request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PUT', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('put-payload')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PUT', requests)!

  expect(capturedRequest.method).toEqual('PUT')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
  expect(capturedRequest.body).toEqual('put-payload')
})

test('intercepts an HTTPS PATCH request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PATCH', url)
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('patch-payload')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PATCH', requests)!

  expect(capturedRequest.method).toEqual('PATCH')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
  expect(capturedRequest.body).toEqual('patch-payload')
})

test('intercepts an HTTPS DELETE request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('DELETE', url)
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'DELETE', requests)!

  expect(capturedRequest.method).toEqual('DELETE')
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.href).toEqual(url)
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('sets "credentials" to "include" on isomorphic request when "withCredentials" is true', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
    req.withCredentials = true
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', requests)!

  expect(capturedRequest.credentials).toEqual('include')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is not set', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', requests)!

  expect(capturedRequest.credentials).toEqual('omit')
})

test('sets "credentials" to "omit" on isomorphic request when "withCredentials" is false', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', httpServer.https.makeUrl('/user'))
    req.withCredentials = false
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', requests)!

  expect(capturedRequest.credentials).toEqual('omit')
})
