import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import https from 'https'
import { HttpServer } from '@open-draft/test-server/http'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src/glossary'
import { RequestController } from '../../../../src/RequestController'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body').end()
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

it('intercepts a GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const request = https.get(url, {
    rejectUnauthorized: false,
    headers: {
      'x-custom-header': 'yes',
    },
  })

  await waitForClientRequest(request)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request: requestFromListener, requestId, controller }] =
    resolver.mock.calls[0]

  expect(requestFromListener.method).toBe('GET')
  expect(requestFromListener.url).toBe(url)
  expect(
    Object.fromEntries(requestFromListener.headers.entries())
  ).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(requestFromListener.credentials).toBe('same-origin')
  expect(requestFromListener.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an https.get request given RequestOptions without a protocol', async () => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  const req = https.get({
    host: httpServer.https.address.host,
    port: httpServer.https.address.port,
    path: '/user?id=123',
    // Suppress the "certificate has expired" error.
    rejectUnauthorized: false,
  })
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.headers.get('host')).toBe(
    `${httpServer.https.address.host}:${httpServer.https.address.port}`
  )
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
