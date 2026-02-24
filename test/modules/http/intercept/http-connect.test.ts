// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import net from 'node:net'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/resource', (req, res) => {
    res.send('original')
  })
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

it('intercepts a "CONNECT" request using IP as the authority', async () => {
  const requestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()

  const serverHost = `${httpServer.http.address.host}:${httpServer.http.address.port}`

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      /**
       * @note CONNECT requests use "path" to describe the requested authority
       * in a "host:port" format.
       */
      path: serverHost,
    })
    .end()

  request.on('connect', connectListener).on('response', responseListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect(connectListener).toHaveBeenCalledExactlyOnceWith(
    // The mocked response sent from the interceptor.
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    }),
    expect.any(net.Socket),
    expect.any(Buffer)
  )

  // CONNECT requests do NOT produce an actual response.
  expect(responseListener).not.toHaveBeenCalled()

  const interceptedRequest = await requestPromise

  expect.soft(interceptedRequest.method).toBe('CONNECT')
  expect
    .soft(interceptedRequest.url, 'Sets connect authority as the request URL')
    .toBe(serverHost)
  expect.soft(Array.from(interceptedRequest.headers)).toEqual([
    ['connection', 'keep-alive'],
    ['host', '127.0.0.1:1337'],
  ])
})

/**
 * @note This test exists only because Node.js has a bug parsing
 * URLs like "http://127.0.0.1:1337/localhost:80". It would treat "localhost:"
 * as a protocol.
 */
it('intercepts a "CONNECT" request using "localhost" as the authority', async () => {
  const requestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.respondWith(new Response())
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()

  const serverHost = `localhost:${httpServer.http.address.port}`

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      path: serverHost,
    })
    .end()

  request.on('connect', connectListener).on('response', responseListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()
  expect(connectListener).toHaveBeenCalledExactlyOnceWith(
    // The mocked response sent from the interceptor.
    expect.objectContaining({
      statusCode: 200,
      statusMessage: 'OK',
    }),
    expect.any(net.Socket),
    expect.any(Buffer)
  )

  // CONNECT requests do NOT produce an actual response.
  expect(responseListener).not.toHaveBeenCalled()

  const interceptedRequest = await requestPromise

  expect.soft(interceptedRequest.method).toBe('CONNECT')
  expect
    .soft(interceptedRequest.url, 'Sets connect authority as the request URL')
    .toBe(serverHost)
  expect.soft(Array.from(interceptedRequest.headers)).toEqual([
    ['connection', 'keep-alive'],
    ['host', '127.0.0.1:1337'],
  ])
})

it('errors the intercepted "CONNECT" request', async () => {
  const requestPromise = new DeferredPromise<Request>()

  interceptor.on('request', ({ request, controller }) => {
    requestPromise.resolve(request)
    controller.errorWith(new Error('Custom reason'))
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()

  const serverHost = `localhost:${httpServer.http.address.port}`

  const request = http
    .request({
      method: 'CONNECT',
      host: '127.0.0.1',
      port: 1337,
      path: serverHost,
    })
    .end()

  request
    .on('connect', connectListener)
    .on('response', responseListener)
    .on('error', errorListener)
    .on('close', closeListener)

  await expect.poll(() => errorListener).toHaveBeenCalledOnce()
  expect(errorListener).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: 'Custom reason' })
  )
  expect(closeListener).toHaveBeenCalledOnce()
  expect(connectListener).not.toHaveBeenCalled()
  expect(responseListener).not.toHaveBeenCalled()
})
