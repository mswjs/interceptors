/**
 * @jest-environment jsdom
 */
import { Response } from '@remix-run/web-fetch'
import { HttpServer } from '@open-draft/test-server/http'
import { XMLHttpRequestInterceptor } from '../../../../src/interceptors/XMLHttpRequest'
import { createXMLHttpRequest } from '../../../helpers'
import { AnyUuid, anyUuid, headersContaining } from '../../../jest.expect'

const server = new HttpServer((app) => {
  app.get('/bypassed', (req, res) => {
    res.status(201).set('Content-Type', 'text/plain').send('original response')
  })
})

const interceptor = new XMLHttpRequestInterceptor()

interceptor.on('request', (request, requestId) => {
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
  const requestListener = jest.fn()
  const responseListener = jest.fn()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/user'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: server.http.url('/user'),
      headers: headersContaining({}),
      respondWith: expect.any(Function),
    }),
    anyUuid()
  )

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [response, request, requestId] = responseListener.mock.calls[0]

  expect(response).toBeInstanceOf(Response)
  expect(response.status).toBe(200)
  expect(response.statusText).toBe('OK')
  expect(response.headers.get('Content-Type')).toBe('text/plain;charset=UTF-8')
  expect(response.bodyUsed).toBe(false)
  expect(await response.text()).toBe('mocked response')

  expect(request).toEqual(
    expect.objectContaining({
      method: 'GET',
      url: server.http.url('/user'),
      headers: headersContaining({}),
    })
  )

  expect(requestId).toMatch(AnyUuid.uuidRegExp)
})

it('emits events for a bypassed request', async () => {
  const requestListener = jest.fn()
  const responseListener = jest.fn()
  interceptor.on('request', requestListener)
  interceptor.on('response', responseListener)

  await createXMLHttpRequest((request) => {
    request.open('GET', server.http.url('/bypassed'))
    request.send()
  })

  // Must call the "request" event listener.
  expect(requestListener).toHaveBeenCalledTimes(1)
  expect(requestListener).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      url: server.http.url('/bypassed'),
      headers: headersContaining({}),
      respondWith: expect.any(Function),
    }),
    anyUuid()
  )

  // Must call the "response" event listener.
  expect(responseListener).toHaveBeenCalledTimes(1)
  const [response, request, requestId] = responseListener.mock.calls[0]

  expect(response).toBeInstanceOf(Response)
  expect(response.status).toBe(201)
  // Note that Express infers status texts from the code.
  expect(response.statusText).toBe('Created')
  // Express also adds whitespace between the header pairs.
  expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
  expect(response.bodyUsed).toBe(false)
  expect(await response.text()).toBe('original response')

  expect(request).toEqual(
    expect.objectContaining({
      method: 'GET',
      url: server.http.url('/bypassed'),
      headers: headersContaining({}),
    })
  )

  expect(requestId).toMatch(AnyUuid.uuidRegExp)
})
