/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index'
import { HttpRequestEventMap } from '../../../../src/glossary'
import { REQUEST_ID_REGEXP, waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('original-response')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('emits the "request" event for an outgoing request without body', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.once('request', requestListener)

  await waitForClientRequest(
    http.get(httpServer.http.url('/'), {
      headers: {
        'x-custom-header': 'yes',
      },
    })
  )

  expect(requestListener).toHaveBeenCalledTimes(1)

  const { request } = requestListener.mock.calls[0][0]
  expect(request).toBeInstanceOf(Request)
  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.http.url('/'))
  expect(Object.fromEntries(request.headers.entries())).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(request.body).toBe(null)
})

it('emits the "request" event for an outgoing request with a body', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  interceptor.once('request', requestListener)

  const request = http.request(httpServer.http.url('/'), {
    method: 'POST',
    headers: {
      'content-type': 'text/plain',
      'x-custom-header': 'yes',
    },
  })
  request.write('post-payload')
  request.end()
  await waitForClientRequest(request)

  expect(requestListener).toHaveBeenCalledTimes(1)

  const { request: requestFromListener } = requestListener.mock.calls[0][0]
  expect(requestFromListener).toBeInstanceOf(Request)
  expect(requestFromListener.method).toBe('POST')
  expect(requestFromListener.url).toBe(httpServer.http.url('/'))
  expect(
    Object.fromEntries(requestFromListener.headers.entries())
  ).toMatchObject({
    'content-type': 'text/plain',
    'x-custom-header': 'yes',
  })
  expect(await requestFromListener.text()).toBe('post-payload')
})

it('emits the "response" event for a mocked response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })
  interceptor.once('response', responseListener)

  const request = http.get('http://localhost', {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { res, text } = await waitForClientRequest(request)

  // Must emit the "response" interceptor event.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const {
    response,
    requestId,
    request: requestFromListener,
    isMockedResponse,
  } = responseListener.mock.calls[0][0]
  expect(response).toBeInstanceOf(Response)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('hello world')
  expect(isMockedResponse).toBe(true)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
  expect(requestFromListener).toBeInstanceOf(Request)
  expect(requestFromListener.method).toBe('GET')
  expect(requestFromListener.url).toBe('http://localhost/')
  expect(
    Object.fromEntries(requestFromListener.headers.entries())
  ).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(requestFromListener.body).toBe(null)

  // Must respond with the mocked response.
  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('hello world')
})

it('emits the "response" event for a bypassed response', async () => {
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.once('response', responseListener)

  const request = http.get(httpServer.http.url('/'), {
    headers: {
      'x-custom-header': 'yes',
    },
  })
  const { res, text } = await waitForClientRequest(request)

  // Must emit the "response" interceptor event.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const {
    response,
    requestId,
    request: requestFromListener,
    isMockedResponse,
  } = responseListener.mock.calls[0][0]
  expect(response).toBeInstanceOf(Response)
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('original-response')
  expect(isMockedResponse).toBe(false)

  expect(requestId).toMatch(REQUEST_ID_REGEXP)
  expect(requestFromListener).toBeInstanceOf(Request)
  expect(requestFromListener.method).toBe('GET')
  expect(requestFromListener.url).toBe(httpServer.http.url('/'))
  expect(
    Object.fromEntries(requestFromListener.headers.entries())
  ).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(requestFromListener.body).toBe(null)

  // Must respond with the mocked response.
  expect(res.statusCode).toBe(200)
  expect(await text()).toBe('original-response')
})
