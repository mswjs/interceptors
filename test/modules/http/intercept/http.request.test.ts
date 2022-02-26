/**
 * @jest-environment node
 */
import * as http from 'http'
import { RequestHandler } from 'express-serve-static-core'
import { ServerApi, createServer } from '@open-draft/test-server'
import { createInterceptor } from '../../../../src'
import { interceptClientRequest } from '../../../../src/interceptors/ClientRequest'
import { Resolver } from '../../../../src/createInterceptor'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'

let httpServer: ServerApi

const resolver = jest.fn<ReturnType<Resolver>, Parameters<Resolver>>()
const interceptor = createInterceptor({
  modules: [interceptClientRequest],
  resolver,
})

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
  interceptor.restore()
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      url: new URL(url),
      method: 'HEAD',
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(http.IncomingMessage)
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(http.IncomingMessage)
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'POST',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'post-payload',
    },
    expect.any(http.IncomingMessage)
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'put-payload',
    },
    expect.any(http.IncomingMessage)
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: 'patch-payload',
    },
    expect.any(http.IncomingMessage)
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
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(url),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'omit',
      body: '',
    },
    expect.any(http.IncomingMessage)
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

  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>(
    {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.makeUrl('/user?id=123')),
      headers: headersContaining({}),
      credentials: 'omit',
      body: '',
    },
    expect.any(http.IncomingMessage)
  )
})
