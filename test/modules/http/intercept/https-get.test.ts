import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { REQUEST_ID_REGEXP, toWebResponse } from '#/test/helpers'
import { HttpRequestEventMap } from '#/src/events/http'
import { RequestController } from '#/src/request-controller'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

let httpServer: TestHttpServer

const resolver = vi.fn<(event: HttpRequestEventMap['request']) => void>()
const interceptor = new HttpRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/user', () => {
        return new Response('user-body')
      })
    },
  })
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
  const url = httpServer.https.url('/user?id=123').href
  const request = https.get(url, {
    rejectUnauthorized: false,
    headers: {
      'x-custom-header': 'yes',
    },
  })

  await toWebResponse(request)

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
    host: httpServer.https.url().hostname,
    port: httpServer.https.url().port,
    path: '/user?id=123',
    // Suppress the "certificate has expired" error.
    rejectUnauthorized: false,
  })
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.headers.get('host')).toBe(httpServer.https.url().host)
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
