/**
 * @jest-environment node
 */
import fetch from 'node-fetch'
import { RequestHandler } from 'express'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../../src'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { encodeBuffer } from '../../../../src/utils/bufferUtils'

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

test('intercepts an HTTP HEAD request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP GET request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        accept: '*/*',
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(JSON.stringify({ body: true })),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP PUT request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PUT',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('request-payload'),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP DELETE request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTP PATCH request', async () => {
  await fetch(httpServer.http.url('/user?id=123'), {
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(httpServer.http.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('request-payload'),
      respondWith: expect.any(Function),
    })
  )
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'HEAD',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS GET request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    headers: {
      'x-custom-header': 'yes',
    },
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'GET',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'POST',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(JSON.stringify({ body: true })),
      respondWith: expect.any(Function),
    })
  )
})

test('intercepts an HTTPS PUT request', async () => {
  await fetch(httpServer.https.url('/user?id=123'), {
    agent: httpsAgent,
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
    body: encodeBuffer('request-payload'),
  })

  expect(resolver).toHaveBeenCalledTimes(1)
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PUT',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer('request-payload'),
      respondWith: expect.any(Function),
    })
  )
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'DELETE',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
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
  expect(resolver).toHaveBeenCalledWith<
    Parameters<HttpRequestEventMap['request']>
  >(
    expect.objectContaining({
      id: anyUuid(),
      method: 'PATCH',
      url: new URL(httpServer.https.url('/user?id=123')),
      headers: headersContaining({
        'x-custom-header': 'yes',
      }),
      credentials: 'same-origin',
      _body: encodeBuffer(''),
      respondWith: expect.any(Function),
    })
  )
})
