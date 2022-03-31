/**
 * @jest-environment node
 */
import * as https from 'https'
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { waitForClientRequest } from '../../../helpers'
import { anyUuid, headersContaining } from '../../../jest.expect'
import {
  ClientRequestEventListener,
  ClientRequestInterceptor,
  InteractiveIsomorphicRequest,
} from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const resolver = jest.fn<never, Parameters<ClientRequestEventListener>>()
const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createServer((app) => {
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
  jest.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

test('intercepts a HEAD request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'HEAD',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: '',
    respondWith: expect.any(Function),
  })
})

test('intercepts a GET request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'GET',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: '',
    respondWith: expect.any(Function),
  })
})

test('intercepts a POST request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'POST',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: 'post-payload',
    respondWith: expect.any(Function),
  })
})

test('intercepts a PUT request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'PUT',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: 'put-payload',
    respondWith: expect.any(Function),
  })
})

test('intercepts a PATCH request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'PATCH',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: 'patch-payload',
    respondWith: expect.any(Function),
  })
})

test('intercepts a DELETE request', async () => {
  const url = httpServer.https.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'DELETE',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({
      'x-custom-header': 'yes',
    }),
    credentials: 'same-origin',
    body: '',
    respondWith: expect.any(Function),
  })
})

test('intercepts an http.request request given RequestOptions without a protocol', async () => {
  const req = https.request({
    agent: httpsAgent,
    host: httpServer.https.getAddress().host,
    port: httpServer.https.getAddress().port,
    path: '/user?id=123',
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<[InteractiveIsomorphicRequest]>({
    id: anyUuid(),
    method: 'GET',
    url: new URL(httpServer.https.makeUrl('/user?id=123')),
    headers: headersContaining({}),
    credentials: 'same-origin',
    body: '',
    respondWith: expect.any(Function),
  })
})
