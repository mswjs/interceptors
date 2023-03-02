// @vitest-environment jsdom
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest, useCors, UUID_REGEXP } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src'

const server = new HttpServer((app) => {
  app.use(useCors)
  app.get('/bypassed', (req, res) => {
    res.status(201).set('Content-Type', 'text/plain').send('original response')
  })
})

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', (request) => {
  if (request.url.endsWith('/user')) {
    return request.respondWith(
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
  const requestListener = vi.fn<HttpRequestEventMap['request']>()
  const responseListener = vi.fn<HttpRequestEventMap['response']>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/user'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const requestParams = requestListener.mock.calls[0]

  expect(requestParams[0]).toBeInstanceOf(Request)
  expect(requestParams[0].method).toBe('GET')
  expect(requestParams[0].url).toBe(server.http.url('/user'))

  expect(requestParams[1]).toMatch(UUID_REGEXP)

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const responseParams = responseListener.mock.calls[0]

  expect(responseParams[0]).toBeInstanceOf(Response)
  expect(responseParams[0].status).toBe(200)
  expect(responseParams[0].statusText).toBe('OK')
  expect(responseParams[0].headers.get('Content-Type')).toBe(
    'text/plain;charset=UTF-8'
  )
  expect(responseParams[0].bodyUsed).toBe(false)
  expect(await responseParams[0].text()).toBe('mocked response')

  expect(responseParams[1]).toBeInstanceOf(Request)
  expect(responseParams[1].method).toBe('GET')
  expect(responseParams[1].url).toBe(server.http.url('/user'))

  expect(responseParams[2]).toMatch(UUID_REGEXP)
})

it('emits events for a bypassed request', async () => {
  const requestListener = vi.fn<HttpRequestEventMap['request']>()
  const responseListener = vi.fn<HttpRequestEventMap['response']>()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/bypassed'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  const requestParams = requestListener.mock.calls[0]

  expect(requestParams[0]).toBeInstanceOf(Request)
  expect(requestParams[0].method).toBe('GET')
  expect(requestParams[0].url).toBe(server.http.url('/bypassed'))
  expect(requestParams[0]).toHaveProperty('respondWith', expect.any(Function))

  // The last argument of the request listener is the request ID.
  expect(requestParams[1]).toMatch(UUID_REGEXP)

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const responseParams = responseListener.mock.calls[0]

  expect(responseParams[0]).toBeInstanceOf(Response)
  expect(responseParams[0].status).toBe(201)
  // Note that Express infers status texts from the code.
  expect(responseParams[0].statusText).toBe('Created')
  // Express also adds whitespace between the header pairs.
  expect(responseParams[0].headers.get('Content-Type')).toBe(
    'text/plain; charset=utf-8'
  )
  expect(responseParams[0].bodyUsed).toBe(false)
  expect(await responseParams[0].text()).toBe('original response')

  // Response listener must provide a relevant request.
  expect(responseParams[1]).toBeInstanceOf(Request)
  expect(responseParams[1].method).toBe('GET')
  expect(responseParams[1].url).toBe(server.http.url('/bypassed'))

  // The last argument of the response listener is the request ID.
  expect(responseParams[2]).toMatch(UUID_REGEXP)
})
