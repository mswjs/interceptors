// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import https from 'node:https'
import { RequestHandler } from 'express'
import { HttpServer } from '@open-draft/test-server/http'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'
import { RequestController } from '../../../../src/RequestController'

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

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts a HEAD request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('HEAD')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  expect(interceptedRequest.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a GET request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('GET')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  expect(interceptedRequest.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a POST request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.write('post-payload')
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('POST')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  await expect(interceptedRequest.text()).resolves.toBe('post-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a PUT request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.write('put-payload')
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('PUT')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  await expect(interceptedRequest.text()).resolves.toBe('put-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a PATCH request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.write('patch-payload')
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('PATCH')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  await expect(interceptedRequest.text()).resolves.toBe('patch-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a DELETE request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const url = httpServer.https.url('/user?id=123')
  const request = https.request(url, {
    rejectUnauthorized: false,
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('DELETE')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  await expect(interceptedRequest.text()).resolves.toBe('')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an http.request request given RequestOptions without a protocol', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.on('request', requestListener)

  const request = https.request({
    rejectUnauthorized: false,
    host: httpServer.https.address.host,
    port: httpServer.https.address.port,
    path: '/user?id=123',
  })
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect(interceptedRequest.method).toBe('GET')
  expect(interceptedRequest.url).toBe(httpServer.https.url('/user?id=123'))
  expect(interceptedRequest.credentials).toBe('same-origin')
  expect(interceptedRequest.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
