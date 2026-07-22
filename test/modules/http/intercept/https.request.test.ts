// @vitest-environment node
import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { REQUEST_ID_REGEXP, toWebResponse } from '#/test/helpers'
import { HttpRequestEventMap } from '#/src/index'
import { RequestController } from '#/src/RequestController'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

let httpServer: TestHttpServer

const resolver = vi.fn<(event: HttpRequestEventMap['request']) => void>()
const interceptor = new HttpRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      const handleUserRequest = () => {
        return new Response('user-body')
      }

      router.get('/user', handleUserRequest)
      router.post('/user', handleUserRequest)
      router.put('/user', handleUserRequest)
      router.delete('/user', handleUserRequest)
      router.patch('/user', handleUserRequest)
      // Hono routes "HEAD" via "GET" handlers automatically.
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

it('intercepts a HEAD request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'HEAD',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('HEAD')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a GET request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'GET',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a POST request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'POST',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('post-payload')
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('post-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a PUT request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'PUT',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('put-payload')
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PUT')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('put-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a PATCH request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'PATCH',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.write('patch-payload')
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('PATCH')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('patch-payload')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts a DELETE request', async () => {
  const url = httpServer.https.url('/user?id=123').href
  const req = https.request(url, {
    rejectUnauthorized: false,
    method: 'DELETE',
    headers: {
      'x-custom-header': 'yes',
    },
  })
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('DELETE')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  await expect(request.text()).resolves.toBe('')
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('intercepts an http.request request given RequestOptions without a protocol', async () => {
  const req = https.request({
    rejectUnauthorized: false,
    host: httpServer.https.url().hostname,
    port: httpServer.https.url().port,
    path: '/user?id=123',
  })
  req.end()
  await toWebResponse(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123').href)
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
