/**
 * @jest-environment node
 */
import * as http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { anyUuid, headersContaining } from '../../../jest.expect'
import { waitForClientRequest } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const resolver = jest.fn<never, HttpRequestEventMap['request']>()

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

test('intercepts an http.get request', async () => {
  const url = httpServer.http.url('/user?id=123')
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(url)
  expect(request.headers).toEqual(
    headersContaining({
      'x-custom-header': 'yes',
    })
  )
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})

test('intercepts an http.get request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.get({
    host: httpServer.http.address.host,
    port: httpServer.http.address.port,
    path: '/user?id=123',
  })
  const { text } = await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [request, requestId] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.http.url('/user?id=123'))
  expect(request.headers.get('host')).toBe(
    `${httpServer.http.address.host}:${httpServer.http.address.port}`
  )
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toEqual(anyUuid())

  // Must receive the original response.
  expect(await text()).toBe('user-body')
})
