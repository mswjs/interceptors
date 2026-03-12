// @vitest-environment happy-dom
import http from 'node:http'
import { REQUEST_ID_REGEXP, toWebResponse } from '#/test/helpers'
import { BatchInterceptor } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { RequestController } from '#/src/RequestController'
import { waitForXMLHttpRequest } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new BatchInterceptor({
  name: 'batch-interceptor',
  interceptors: [
    new ClientRequestInterceptor(),
    new XMLHttpRequestInterceptor(),
    new FetchInterceptor(),
  ],
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('ClientRequest: emits the "request" event upon the request', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = server.http.url('/user')
  const req = http.request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
  })
  req.write(JSON.stringify({ userId: 'abc-123' }))
  req.end()
  await toWebResponse(req)

  expect.soft(requestListener).toHaveBeenCalledTimes(1)

  const [{ request, requestId, controller }] = requestListener.mock.calls[0]

  expect.soft(request.method).toBe('POST')
  expect.soft(request.url).toBe(url.href)
  expect.soft(request.headers.get('content-type')).toBe('application/json')
  expect.soft(request.credentials).toBe('same-origin')
  await expect.soft(request.json()).resolves.toEqual({ userId: 'abc-123' })
  expect.soft(controller).toBeInstanceOf(RequestController)

  expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
})

it('XMLHttpRequest: emits the "request" event upon the request (no CORS)', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = server.http.url('/user')
  const request = new XMLHttpRequest()
  request.open('POST', url)
  request.setRequestHeader('content-type', 'application/json')
  request.send(JSON.stringify({ userId: 'abc-123' }))

  await waitForXMLHttpRequest(request)

  /**
   * @note XHR in HappyDOM issues a preflight OPTIONS request.
   */
  expect.soft(requestListener).toHaveBeenCalledTimes(2)

  // Preflight request.
  {
    const [{ request }] = requestListener.mock.calls[1]

    expect.soft(request.method).toBe('OPTIONS')
    expect.soft(request.url).toBe(url.href)
    await expect.soft(request.text()).resolves.toBe('')
  }

  {
    const [{ request, requestId, controller }] = requestListener.mock.calls[1]

    expect.soft(request.method).toBe('POST')
    expect.soft(request.url).toBe(url.href)
    expect.soft(request.headers.get('content-type')).toBe('application/json')
    expect.soft(request.credentials).toBe('same-origin')
    await expect.soft(request.json()).resolves.toEqual({ userId: 'abc-123' })
    expect.soft(controller).toBeInstanceOf(RequestController)

    expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
  }
})

it('XMLHttpRequest: emits the preflight "request" event upon the request (CORS)', async () => {
  const requestListener = vi.fn()
  interceptor.on('request', requestListener)

  const url = server.http.url('/user')
  const request = new XMLHttpRequest()
  request.open('POST', url)
  request.setRequestHeader('content-type', 'application/json')
  /**
   * @note The addition of this custom header triggers the OPTIONS request in XHR.
   */
  request.setRequestHeader('X-Custom-Header', 'yes')
  request.send(JSON.stringify({ userId: 'abc-123' }))

  await waitForXMLHttpRequest(request)

  expect.soft(requestListener).toHaveBeenCalledTimes(2)
  expect.soft(requestListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      request: expect.objectContaining({
        method: 'OPTIONS',
        url,
      }),
    })
  )
  expect.soft(requestListener).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      request: expect.objectContaining({
        method: 'POST',
        url,
      }),
    })
  )

  {
    const [{ request, requestId, controller }] = requestListener.mock.calls[1]

    expect.soft(request.method).toBe('POST')
    expect.soft(request.url).toBe(url.href)
    expect.soft(request.headers.get('content-type')).toBe('application/json')
    expect.soft(request.credentials).toBe('same-origin')
    await expect.soft(request.json()).resolves.toEqual({ userId: 'abc-123' })
    expect.soft(controller).toBeInstanceOf(RequestController)

    expect.soft(requestId).toMatch(REQUEST_ID_REGEXP)
  }
})
