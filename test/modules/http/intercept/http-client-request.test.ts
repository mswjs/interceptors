import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { RequestController } from '../../../../src/RequestController'
import { HttpRequestEventMap } from '../../../../src/glossary'

const httpServer = new HttpServer((app) => {
  app.get('/user', (_req, res) => {
    res.status(200).send('user-body')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an HTTP ClientRequest request with request options', async () => {
  const url = new URL(httpServer.http.url('/user?id=123'))
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)

  // Send options object instead of (url, options) as in other tests
  // because the @types/node is incorrect and does not have the correct signature
  const req = new http.ClientRequest({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('intercepts an HTTP ClientRequest request with URL string', async () => {
  const url = httpServer.http.url('/user?id=123')
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)
  const req = new http.ClientRequest(url)
  req.setHeader('x-custom-header', 'yes')
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('intercepts an HTTP ClientRequest request with URL instance', async () => {
  const url = new URL(httpServer.http.url('/user?id=123'))
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)
  const req = new http.ClientRequest(url)
  req.setHeader('x-custom-header', 'yes')
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('intercepts an HTTPS ClientRequest request with URL string', async () => {
  const url = httpServer.https.url('/user?id=123')
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)
  const req = new http.ClientRequest(url)
  req.setHeader('x-custom-header', 'yes')
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('intercepts an HTTPS ClientRequest request with URL instance', async () => {
  const url = new URL(httpServer.https.url('/user?id=123'))
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)
  const req = new http.ClientRequest(url)
  req.setHeader('x-custom-header', 'yes')
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('intercepts an HTTPS ClientRequest request with request options', async () => {
  const url = new URL(httpServer.https.url('/user?id=123'))
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)
  const req = new http.ClientRequest({
    protocol: 'https:',
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()

  const { text } = await waitForClientRequest(req)
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url.toString())
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

it('restores the original ClientRequest class after disposal', async () => {
  interceptor.dispose()

  expect(
    http.ClientRequest,
    'Failed to restore the ClientRequest class to its original implementation'
  ).toEqual(await import('node:http').then((exports) => exports.ClientRequest))

  const request = new http.ClientRequest('http://localhost/does-not-matter').on(
    'error',
    () => {}
  )
  expect(Reflect.get(request, 'agent')).toBeInstanceOf(http.Agent)
})
