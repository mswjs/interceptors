// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import {
  createXMLHttpRequest,
  useCors,
  REQUEST_ID_REGEXP,
} from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'
import { RequestController } from '../../../../src/RequestController'

const server = new HttpServer((app) => {
  app.use(useCors)
  app.get('/bypassed', (req, res) => {
    res.status(201).set('Content-Type', 'text/plain').send('original response')
  })
})

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', ({ request, controller }) => {
  if (request.url.endsWith('/user')) {
    return controller.respondWith(
      new Response('mocked response', {
        status: 200,
        statusText: 'OK',
      })
    )
  }
})

beforeAll(async () => {
  interceptor.apply()
  await server.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await server.close()
})

it('emits events for a handled request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/user'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const [requestParams] = requestListener.mock.calls[0]

  expect(requestParams.request).toBeInstanceOf(Request)
  expect(requestParams.request.method).toBe('GET')
  expect(requestParams.request.url).toBe(server.http.url('/user'))

  expect(requestParams.requestId).toMatch(REQUEST_ID_REGEXP)

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [responseParams] = responseListener.mock.calls[0]

  expect(responseParams.response).toBeInstanceOf(Response)
  expect(responseParams.response.status).toBe(200)
  expect(responseParams.response.statusText).toBe('OK')
  expect(responseParams.response.headers.get('Content-Type')).toBe(
    'text/plain;charset=UTF-8'
  )
  expect(responseParams.response.bodyUsed).toBe(false)
  expect(await responseParams.response.text()).toBe('mocked response')

  expect(responseParams.request).toBeInstanceOf(Request)
  expect(responseParams.request.method).toBe('GET')
  expect(responseParams.request.url).toBe(server.http.url('/user'))

  expect(responseParams.requestId).toMatch(REQUEST_ID_REGEXP)
})

it('emits events for a bypassed request', async () => {
  const requestListener =
    vi.fn<(...args: HttpRequestEventMap['request']) => void>()
  const responseListener =
    vi.fn<(...args: HttpRequestEventMap['response']) => void>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/bypassed'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const [requestParams] = requestListener.mock.calls[0]

  expect(requestParams.request).toBeInstanceOf(Request)
  expect(requestParams.request.method).toBe('GET')
  expect(requestParams.request.url).toBe(server.http.url('/bypassed'))
  expect(requestParams.controller).toBeInstanceOf(RequestController)

  // The last argument of the request listener is the request ID.
  expect(requestParams.requestId).toMatch(REQUEST_ID_REGEXP)

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [responseParams] = responseListener.mock.calls[0]

  expect(responseParams.response).toBeInstanceOf(Response)
  expect(responseParams.response.status).toBe(201)
  // Note that Express infers status texts from the code.
  expect(responseParams.response.statusText).toBe('Created')
  // Express also adds whitespace between the header pairs.
  expect(responseParams.response.headers.get('Content-Type')).toBe(
    'text/plain; charset=utf-8'
  )
  expect(responseParams.response.bodyUsed).toBe(false)
  expect(await responseParams.response.text()).toBe('original response')

  // Response listener must provide a relevant request.
  expect(responseParams.request).toBeInstanceOf(Request)
  expect(responseParams.request.method).toBe('GET')
  expect(responseParams.request.url).toBe(server.http.url('/bypassed'))

  // The last argument of the response listener is the request ID.
  expect(responseParams.requestId).toMatch(REQUEST_ID_REGEXP)
})
