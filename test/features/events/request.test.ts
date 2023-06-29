// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../src'
import {
  createXMLHttpRequest,
  useCors,
  UUID_REGEXP,
  waitForClientRequest,
} from '../../helpers'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'
import { BatchInterceptor } from '../../../src/BatchInterceptor'
import { XMLHttpRequestInterceptor } from '../../../src/interceptors/XMLHttpRequest'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.post('/user', (req, res) => {
    res.status(201).end()
  })
})

const requestListener = vi.fn<HttpRequestEventMap['request']>()

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
  ],
})
interceptor.on('request', requestListener)

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('ClientRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.url('/user')
  const req = http.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  req.write(JSON.stringify({ userId: 'abc-123' }))
  req.end()
  await waitForClientRequest(req)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ userId: 'abc-123' })
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('XMLHttpRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.url('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  /**
   * @note There are two "request" events emitted because XMLHttpRequest
   * is polyfilled by "http.ClientRequest" in JSDOM. When this request gets
   * bypassed by XMLHttpRequest interceptor, JSDOM constructs "http.ClientRequest"
   * to perform it as-is. This issues an additional OPTIONS request first.
   */
  expect(requestListener).toHaveBeenCalledTimes(2)

  const [{ request, requestId }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ userId: 'abc-123' })
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})
