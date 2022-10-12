/**
 * @jest-environment node
 */
import * as https from 'https'
import { RequestHandler } from 'express'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { waitForClientRequest } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { HttpRequestEventMap } from '../../../../src'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
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

const resolver = jest.fn<never, Parameters<HttpRequestEventMap['request']>>()
const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('intercepts a HEAD request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts a GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts a POST request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('post-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('post-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts a PUT request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('put-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('put-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts a PATCH request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('patch-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('PATCH')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('patch-payload')
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts a DELETE request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const req = https.request(url, {
    agent: httpsAgent,
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})

test('intercepts an http.request request given RequestOptions without a protocol', async () => {
  const req = https.request({
    agent: httpsAgent,
    host: httpServer.https.address.host,
    port: httpServer.https.address.port,
    path: '/user?id=123',
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())
})
