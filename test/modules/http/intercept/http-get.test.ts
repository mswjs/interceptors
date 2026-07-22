import http from 'node:http'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { REQUEST_ID_REGEXP, toWebResponse } from '#/test/helpers'
import { RequestController } from '#/src/request-controller'
import { type HttpRequestEventMap } from '#/src/events/http'

let httpServer: TestHttpServer

const resolver = vi.fn<(event: HttpRequestEventMap['request']) => void>()

const interceptor = new HttpRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createTestHttpServer({
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

it('intercepts an http.get request', async () => {
  const url = httpServer.http.url('/user?id=123').href
  const req = http.get(url, {
    headers: {
      'x-custom-header': 'yes',
    },
  })

  const [response] = await toWebResponse(req)

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
  await expect(response.text()).resolves.toBe('user-body')
})

it('intercepts an http.get request given RequestOptions without a protocol', async () => {
  // Create a request with `RequestOptions` without an explicit "protocol".
  // Since request is done via `http.get`, the "http:" protocol must be inferred.
  const req = http.get({
    host: httpServer.http.url().hostname,
    port: httpServer.http.url().port,
    path: '/user?id=123',
  })
  const [response] = await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.http.url('/user?id=123').href)
  expect(request.headers.get('host')).toBe(httpServer.http.url().host)
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
  await expect(response.text()).resolves.toBe('user-body')
})
