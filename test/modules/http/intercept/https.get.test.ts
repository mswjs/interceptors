import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import https from 'https'
import { HttpServer, httpsAgent } from '@open-draft/test-server/http'
import { UUID_REGEXP, waitForClientRequest } from '../../../helpers'
import { HttpRequestEventMap } from '../../../../src/glossary'
import { _ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index-new'

const httpServer = new HttpServer((app) => {
  app.get('/user', (req, res) => {
    res.status(200).send('user-body').end()
  })
})

const resolver = vi.fn<HttpRequestEventMap['request']>()
const interceptor = new _ClientRequestInterceptor()
interceptor.on('request', resolver)

beforeAll(async () => {
  await httpServer.listen()
  interceptor.apply()
})

afterEach(() => {
  vi.resetAllMocks()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('intercepts a GET request', async () => {
  const url = httpServer.https.url('/user?id=123')
  const request = https.get(url, {
    agent: httpsAgent,
    headers: {
      'x-custom-header': 'yes',
    },
  })

  request
    .on('socket', (socket) => {
      console.log('[test] request "socket" event:', socket.constructor.name)

      socket.on('secureConnect', () => console.log('secureConnect'))
      socket.on('error', (e) => console.error(e))
      socket.on('timeout', () => console.error('timeout'))
      socket.on('close', (e) => console.error(e))
      socket.on('end', () => console.error('end'))
    })
    .on('error', (e) => console.error(e))
    .on('end', () => console.log('end'))
    .on('close', () => console.log('close'))

  await waitForClientRequest(request)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request: requestFromListener, requestId }] = resolver.mock.calls[0]

  expect(requestFromListener.method).toBe('GET')
  expect(requestFromListener.url).toBe(url)
  expect(
    Object.fromEntries(requestFromListener.headers.entries())
  ).toMatchObject({
    'x-custom-header': 'yes',
  })
  expect(requestFromListener.credentials).toBe('same-origin')
  expect(requestFromListener.body).toBe(null)
  expect(requestFromListener.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})

it('intercepts an https.get request given RequestOptions without a protocol', async () => {
  // Pass a RequestOptions object without an explicit `protocol`.
  // The request is made via `https` so the `https:` protocol must be inferred.
  const req = https.get({
    host: httpServer.https.address.host,
    port: httpServer.https.address.port,
    path: '/user?id=123',
    // Suppress the "certificate has expired" error.
    rejectUnauthorized: false,
  })
  await waitForClientRequest(req)

  expect(resolver).toHaveBeenCalledTimes(1)

  const [{ request, requestId }] = resolver.mock.calls[0]

  expect(request.method).toBe('GET')
  expect(request.url).toBe(httpServer.https.url('/user?id=123'))
  expect(request.headers.get('host')).toBe(
    `${httpServer.https.address.host}:${httpServer.https.address.port}`
  )
  expect(request.credentials).toBe('same-origin')
  expect(request.body).toBe(null)
  expect(request.respondWith).toBeInstanceOf(Function)

  expect(requestId).toMatch(UUID_REGEXP)
})
