import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import fetch from 'node-fetch'
import { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { REQUEST_ID_REGEXP } from '../../../helpers'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'
import { RequestController } from '../../../../src/RequestController'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const httpServer = new HttpServer((app) => {
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

const resolver = vi.fn<HttpRequestEventMap['request']>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an HTTP HEAD request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(request.headers.get('x-custom-header')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTP GET request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(request.headers.get('x-custom-header')).toBe('yes')
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTP POST request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
    body: JSON.stringify({ body: true }),
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    accept: '*/*',
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ body: true })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTP PUT request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('request-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTP DELETE request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.arrayBuffer()).toEqual(new ArrayBuffer(0))
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTP PATCH request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PATCH')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('request-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS HEAD request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS GET request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS POST request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
    body: JSON.stringify({ body: true }),
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ body: true })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS PUT request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.text()).toBe('request-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS DELETE request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.arrayBuffer()).toEqual(new ArrayBuffer(0))
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an HTTPS PATCH request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PATCH')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(await request.arrayBuffer()).toEqual(new ArrayBuffer(0))
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
