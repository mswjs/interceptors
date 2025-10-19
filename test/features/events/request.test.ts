// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'http'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestEventMap } from '../../../src'
import {
  createXMLHttpRequest,
  useCors,
  REQUEST_ID_REGEXP,
  waitForClientRequest,
} from '../../helpers'
import { ClientRequestInterceptor } from '../../../src/interceptors/ClientRequest'
import { BatchInterceptor } from '../../../src/BatchInterceptor'
import { XMLHttpRequestInterceptor } from '../../../src/interceptors/XMLHttpRequest'
import { RequestController } from '../../../src/RequestController'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.post('/user', (req, res) => {
    res.status(201).end()
  })
})

const requestListener =
  vi.fn<(...args: HttpRequestEventMap['request']) => void>()

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

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ userId: 'abc-123' })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('XMLHttpRequest: emits the "request" event upon the request', async () => {
  const url = httpServer.http.url('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  /**
   * @note There are 3 requests that happen:
   * 1. POST by XMLHttpRequestInterceptor.
   * 2. OPTIONS request by ClientRequestInterceptor.
   * 3. POST by ClientRequestInterceptor (XHR in JSDOM relies on ClientRequest).
   *
   * But there will only be 2 "request" events emitted:
   * 1. POST by XMLHttpRequestInterceptor.
   * 2. OPTIONS request by ClientRequestInterceptor.
   * The second POST that bubbles down from XHR to ClientRequest is deduped
   * via the "INTERNAL_REQUEST_ID_HEADER_NAME" request header.
   */
  expect(requestListener).toHaveBeenCalledTimes(2)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  expect(await request.json()).toEqual({ userId: 'abc-123' })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
