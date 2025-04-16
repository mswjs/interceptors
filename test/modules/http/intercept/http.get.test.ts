import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { RequestController } from '../../../../src/RequestController'
import { HttpRequestEventMap } from '../../../../src/glossary'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const resolver = vi.fn<(...args: HttpRequestEventMap['request']) => void>()

const interceptor = new ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an http.get request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
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

it('intercepts an http.get request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.get({
    host: httpServer.http.address.host,
    port: httpServer.http.address.port,
    path: '/user?id=123',
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(request.headers.get('host')).toBe(
    `${httpServer.http.address.host}:${httpServer.http.address.port}`
  )
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})
