// @vitest-environment jsdom
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import {
  createXMLHttpRequest,
  useCors,
  REQUEST_ID_REGEXP,
  toWebResponse,
} from '#/test/helpers'
import { BatchInterceptor } from '#/src/BatchInterceptor'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { XMLHttpRequestInterceptor } from '#/src/interceptors/XMLHttpRequest/node'
import { RequestController } from '#/src/RequestController'

const httpServer = new HttpServer((app) => {
  app.use(useCors)
  app.post('/user', (req, res) => {
    res.status(201).end()
  })
})

const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [new HttpRequestInterceptor(), new XMLHttpRequestInterceptor()],
})

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('ClientRequest: emits the "request" event upon the request', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = httpServer.http.url('/user')
  const req = http.request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  req.write(JSON.stringify({ userId: 'abc-123' }))
  req.end()
  await toWebResponse(req)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  await expect(request.json()).resolves.toEqual({ userId: 'abc-123' })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('XMLHttpRequest: emits the "request" event upon the request (no CORS)', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = httpServer.http.url('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  /**
   * @note This XHR request, while cross-origin, doesn't have any other criteria
   * to trigger the OPTIONS preflight request.
   */
  expect(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  await expect(request.json()).resolves.toEqual({ userId: 'abc-123' })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('XMLHttpRequest: emits the preflight "request" event upon the request (CORS)', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = httpServer.http.url('/user')
  await createXMLHttpRequest((req) => {
    req.open('POST', url)
    req.setRequestHeader('Content-Type', 'application/json')
    /**
     * @note The addition of this custom header triggers the OPTIONS request in XHR.
     */
    req.setRequestHeader('X-Custom-Header', 'yes')
    req.send(JSON.stringify({ userId: 'abc-123' }))
  })

  expect(requestListener).toHaveBeenCalledTimes(2)

  expect(requestListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      request: expect.objectContaining({
        method: 'OPTIONS',
        url,
      }),
    })
  )
  expect(requestListener).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      request: expect.objectContaining({
        method: 'POST',
        url,
      }),
    })
  )

  const [{ request, requestId, controller }] = requestListener.mock.calls[1]

  expect(request.method).toBe('POST')
  expect(request.url).toBe(url)
  expect(request.headers.get('content-type')).toBe('application/json')
  expect(request.credentials).toBe('same-origin')
  await expect(request.json()).resolves.toEqual({ userId: 'abc-123' })
  expect(controller).toBeInstanceOf(RequestController)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
})
