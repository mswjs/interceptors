/**
 * @jest-environment node
 */
import * as http from 'http'
import fetch from 'node-fetch'
import { RequestHandler } from 'express'
import { ServerApi, createServer, httpsAgent } from '@open-draft/test-server'
import { createInterceptor, Resolver } from '../../../../src'
import nodeInterceptors from '../../../../src/presets/node'
import { anyUuid, headersContaining } from '../../../jest.expect'

let httpServer: ServerApi

const resolver = jest.fn<ReturnType<Resolver>, Parameters<Resolver>>()
const interceptor = createInterceptor({
  modules: nodeInterceptors,
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
  interceptor.restore()
  await httpServer.close()
})

test('intercepts an HTTP HEAD request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTP GET request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTP POST request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
    body: JSON.stringify({ body: true }),
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: JSON.stringify({ body: true }),
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTP PUT request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'put-payload',
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'put-payload',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTP DELETE request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTP PATCH request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'patch-payload',
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'patch-payload',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS HEAD request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS GET request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS POST request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
    body: JSON.stringify({ body: true }),
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: JSON.stringify({ body: true }),
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS PUT request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: 'put-payload',
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'PUT',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: 'put-payload',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS DELETE request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})

test('intercepts an HTTPS PATCH request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<Parameters<Resolver>>({
    source: 'http',
    target: expect.any(http.IncomingMessage),
    request: {
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      body: '',
    },
    respondWith: expect.any(Function),
    timeStamp: expect.any(Number),
  })
})
