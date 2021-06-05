/**
 * @jest-environment jsdom
 */
import { Headers } from 'headers-utils'
import { RequestHandler } from 'express'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../src'
import { interceptXMLHttpRequest } from '../../../src/interceptors/XMLHttpRequest'
import { findRequest, createXMLHttpRequest } from '../../helpers'
import { IsomorphicRequest } from '../../../src/createInterceptor'

function lookupRequest(
  req: XMLHttpRequest,
  method: string,
  pool: IsomorphicRequest[]
): IsomorphicRequest | undefined {
  return findRequest(pool, method, req.responseURL)
}

let pool: IsomorphicRequest[] = []
let server: ServerApi

const interceptor = createInterceptor({
  modules: [interceptXMLHttpRequest],
  resolver(request) {
    pool.push(request)
  },
})

beforeAll(async () => {
  // @ts-ignore
  // Allow XHR requests to the local HTTPS server with a self-signed certificate.
  window._resourceLoader._strictSSL = false

  server = await createServer((app) => {
    const handleUserRequest: RequestHandler = (req, res) => {
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
  pool = []
})

afterAll(async () => {
  interceptor.restore()
  await server.close()
})

test('intercepts an HTTP GET request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'GET')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP POST request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('request-body')
  })
  const capturedRequest = lookupRequest(originalRequest, 'POST', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'POST')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest).toHaveProperty('body', 'request-body')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP PUT request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PUT', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PUT', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'PUT')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP DELETE request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('DELETE', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'DELETE', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'DELETE')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP PATCH request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PATCH', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PATCH', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'PATCH')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTP HEAD request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('HEAD', server.http.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'HEAD', pool)!!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.http.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'HEAD')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS GET request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('GET', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'GET', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'GET')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS POST request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('POST', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
    req.send('request-body')
  })
  const capturedRequest = lookupRequest(originalRequest, 'POST', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'POST')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest).toHaveProperty('body', 'request-body')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS PUT request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PUT', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PUT', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'PUT')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS DELETE request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('DELETE', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'DELETE', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'DELETE')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS PATCH request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('PATCH', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'PATCH', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'PATCH')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})

test('intercepts an HTTPS HEAD request', async () => {
  const originalRequest = await createXMLHttpRequest((req) => {
    req.open('HEAD', server.https.makeUrl('/user?id=123'))
    req.setRequestHeader('x-custom-header', 'yes')
  })
  const capturedRequest = lookupRequest(originalRequest, 'HEAD', pool)!

  expect(capturedRequest).toBeTruthy()
  expect(capturedRequest.url).toBeInstanceOf(URL)
  expect(capturedRequest.url.toString()).toEqual(
    server.https.makeUrl('/user?id=123')
  )
  expect(capturedRequest).toHaveProperty('method', 'HEAD')
  expect(capturedRequest.url.searchParams.get('id')).toEqual('123')
  expect(capturedRequest.headers).toBeInstanceOf(Headers)
  expect(capturedRequest.headers.get('x-custom-header')).toEqual('yes')
})
