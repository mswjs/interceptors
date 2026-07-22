// @vitest-environment node
import https from 'node:https'
import { TLSSocket } from 'node:tls'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'

const interceptor = new HttpRequestInterceptor()

let httpServer: TestHttpServer

beforeAll(async () => {
  interceptor.apply()
  /**
   * @note No custom routes: the test server responds to "GET /"
   * on its own, and this test only asserts the TLS socket behavior.
   */
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
  })
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
  const socketPromise = Promise.withResolvers<TLSSocket>()
  request.on('socket', socketPromise.resolve)

  const socket = await socketPromise.promise

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
  const request = https.get(httpServer.https.url('/').href, {
    rejectUnauthorized: false,
  })
  const socketPromise = Promise.withResolvers<TLSSocket>()
  const secureConnectListener = vi.fn()

  request.on('socket', (socket) => {
    socketPromise.resolve(socket as TLSSocket)
    socket.on('secureConnect', secureConnectListener)
  })

  const socket = await socketPromise.promise
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
