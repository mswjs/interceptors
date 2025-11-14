// @vitest-environment node
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'
import { RequestController } from '../../../../src/RequestController'
import { HttpRequestEventMap } from '../../../../src/glossary'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body')
  })
})

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts an http.get request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)

  const url = httpServer.http.url('/user?id=123')
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { text } = await waitForClientRequest(req)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

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
  await expect(text()).resolves.toBe('user-body')
})

it('intercepts an http.get request given RequestOptions without a protocol', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()

  interceptor.on('request', requestListener)

  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const request = http.get({
    host: httpServer.http.address.host,
    port: httpServer.http.address.port,
    path: '/user?id=123',
  })
  const { text } = await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request: interceptedRequest, requestId, controller }] =
    requestListener.mock.calls[0]

  expect.soft(interceptedRequest.method).toBe('GET')
  expect.soft(interceptedRequest.url).toBe(httpServer.http.url('/user?id=123'))
  expect
    .soft(interceptedRequest.headers.get('host'))
    .toBe(`${httpServer.http.address.host}:${httpServer.http.address.port}`)
  expect.soft(interceptedRequest.credentials).toBe('same-origin')
  expect.soft(interceptedRequest.body).toBe(null)
  expect.soft(controller).toBeInstanceOf(RequestController)

  expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)

  // Must receive the original response.
  await expect(text()).resolves.toBe('user-body')
})
