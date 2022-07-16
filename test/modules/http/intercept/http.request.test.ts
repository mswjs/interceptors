/**
 * @jest-environment node
 */
import * as http from 'http'
import { RequestHandler } from 'express-serve-static-core'
import { HttpServer } from '@open-draft/test-server/http'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { HttpRequestEventMap } from '../../../../src'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

const httpServer = new HttpServer((app) => {
  const handleUserRequest: RequestHandler = (_req, res) => {
    res.status(200).send('user-body').end()
  }
  app.get('/user', handleUserRequest)
  app.post('/user', handleUserRequest)
  app.put('/user', handleUserRequest)
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
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      url: new URL(url),
      method: 'HEAD',
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts a GET request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts a POST request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('post-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('post-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts a PUT request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('put-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('put-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts a PATCH request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('patch-payload')
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('patch-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts a DELETE request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.request(url, {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an http.request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.request({
    host: httpServer.http.address.host,
    port: httpServer.http.address.port,
    path: '/user?id=123',
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})
