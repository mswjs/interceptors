// @vitest-environment node
import https from 'node:https'
import { TLSSocket } from 'node:tls'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => res.status(200).end())
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

it('emits a correct TLS Socket instance for a handled HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const request = https.get('https://example.com')
  const socketPromise = new DeferredPromise<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise

  expect(socket).toBeInstanceOf(TLSSocket)
  expect(socket.encrypted).toBe(true)
  // The server certificate wasn't signed by one of the CA
  // specified in the Socket constructor.
  expect(socket.authorized).toBe(false)

  expect(socket.getSession()).toBeInstanceOf(Buffer)
  expect(socket.getProtocol()).toBe('TLSv1.3')
  expect(socket.isSessionReused()).toBe(false)
  expect(socket.getCipher()).toEqual({
    name: 'TLS_AES_256_GCM_SHA384',
    standardName: 'TLS_AES_256_GCM_SHA384',
    version: 'TLSv1.3',
  })
})

it('emits a correct TLS Socket instance for a bypassed HTTPS request', async () => {
  const request = https.get(httpServer.https.url('/'), {
    rejectUnauthorized: false,
  })
  const socketPromise = new DeferredPromise<TLSSocket>()
  const secureConnectListener = vi.fn()

  request.on('socket', (socket) => {
    socketPromise.resolve(socket as TLSSocket)
    socket.on('secureConnect', secureConnectListener)
  })

  const socket = await socketPromise
  await expect.poll(() => secureConnectListener).toHaveBeenCalledOnce()

  expect(socket).toBeInstanceOf(TLSSocket)
  expect(socket.encrypted).toBe(true)
  // The server certificate wasn't signed by one of the CA
  // specified in the Socket constructor.
  expect(socket.authorized).toBe(false)

  expect(socket.getSession()).toBeInstanceOf(Buffer)
  expect(socket.getProtocol()).toBe('TLSv1.3')
  expect(socket.getCipher()).toEqual({
    name: 'TLS_AES_256_GCM_SHA384',
    standardName: 'TLS_AES_256_GCM_SHA384',
    version: 'TLSv1.3',
  })
})
