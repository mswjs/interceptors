// @vitest-environment node
/**
 * @see https://github.com/mswjs/interceptors/issues/481
 */
import net from 'node:net'
import http from 'node:http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { waitForClientRequest } from '../../../helpers'

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

it.skip('mocks the entire proxy flow end-to-end', async () => {
  interceptor.on('request', ({ request, controller }) => {
    console.log('-->', request.method, request.url)

    if (request.method === 'CONNECT') {
      return controller.respondWith(new Response())
    }

    controller.respondWith(new Response('mock'))
  })

  const connectListener = vi.fn()
  const responseListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()

  const agent = new HttpsProxyAgent('http://non-existing.remote/server')

  const request = http
    .request({
      hostname: '127.0.0.1',
      port: 80,
      path: '/',
      agent,
    })
    .end()

  request.on('connect', connectListener)

  await expect.poll(() => connectListener).toHaveBeenCalledOnce()

  /**
   * @todo @fixme Finish this test.
   */
})
