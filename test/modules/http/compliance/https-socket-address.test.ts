// @vitest-environment node
import net from 'node:net'
import https from 'node:https'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  /**
   * @note No custom routes: the test server responds to "GET /"
   * on its own, and these tests only assert the socket address.
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

it('exposes socket address information for a mocked HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('mocked response'))
  })

  const request = https.get('https://example.com')
  const addressOnConnectPromise = Promise.withResolvers<
    ReturnType<net.Socket['address']>
  >()
  const addressOnSecureConnectPromise = Promise.withResolvers<
    ReturnType<net.Socket['address']>
  >()

  request.on('socket', (socket) => {
    socket.on('connect', () => {
      addressOnConnectPromise.resolve(socket.address())
    })
    socket.on('secureConnect', () => {
      addressOnSecureConnectPromise.resolve(socket.address())
    })
  })

  await toWebResponse(request)

  await expect(addressOnConnectPromise.promise).resolves.toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: expect.any(Number),
  })
  await expect(addressOnSecureConnectPromise.promise).resolves.toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: expect.any(Number),
  })

  const socket = request.socket!
  expect.soft(socket.remoteAddress).toBe('127.0.0.1')
  expect.soft(socket.remotePort).toBe(443)
  expect.soft(socket.remoteFamily).toBe('IPv4')
  expect.soft(socket.localAddress).toBe('127.0.0.1')
  expect.soft(socket.localPort).toEqual(expect.any(Number))
})

it('exposes socket address information for a bypassed HTTPS request', async () => {
  const request = https.get(httpServer.https.url('/').href, {
    rejectUnauthorized: false,
  })
  const addressOnSecureConnectPromise = Promise.withResolvers<
    ReturnType<net.Socket['address']>
  >()

  request.on('socket', (socket) => {
    socket.on('secureConnect', () => {
      addressOnSecureConnectPromise.resolve(socket.address())
    })
  })

  await toWebResponse(request)

  await expect(addressOnSecureConnectPromise.promise).resolves.toEqual({
    address: '127.0.0.1',
    family: 'IPv4',
    port: expect.any(Number),
  })
})
