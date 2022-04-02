/**
 * @jest-environment node
 */
import * as http from 'http'
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'
import {
  ClientRequestEventListener,
  ClientRequestInterceptor,
} from '../../../../src/interceptors/ClientRequest'

let httpServer: ServerApi

const resolver = jest.fn<never, Parameters<ClientRequestEventListener>>()
const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createServer((app) => {
    const handleUserRequest: RequestHandler = (_req, res) => {
      res.status(200).send('user-body').end()
    }
    app.get('/user', handleUserRequest)
    app.post('/user', handleUserRequest)
    app.put('/user', handleUserRequest)
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
  const url = httpServer.http.makeUrl('/user?id=123')
  const req = http.request(url, {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      url: new URL(url),
      method: 'HEAD',
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts a GET request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const req = http.request(url, {
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts a POST request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'post-payload',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts a PUT request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'put-payload',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts a PATCH request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
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
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'patch-payload',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts a DELETE request', async () => {
  const url = httpServer.http.makeUrl('/user?id=123')
  const req = http.request(url, {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
      respondWith: expect.any(Function),
    }
  )
})

test('intercepts an http.request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.request({
    host: httpServer.http.getAddress().host,
    port: httpServer.http.getAddress().port,
    path: '/user?id=123',
  })
  req.end()
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  expect(resolver).toHaveBeenCalledWith<Parameters<ClientRequestEventListener>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.makeUrl('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'same-origin',
      body: '',
      respondWith: expect.any(Function),
    }
  )
})
