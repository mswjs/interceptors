// @vitest-environment node
import http from 'node:http'
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
   * on its own, and these tests only assert the socket events.
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

it('emits the "connect" event for a mocked HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn()
  const request = http.get(httpServer.http.url('/').href)
  request.on('socket', (socket) => {
    socket.on('connect', connectListener)
  })

  await toWebResponse(request)

  expect(connectListener).toHaveBeenCalledOnce()
})

it('emits the "connect" event for a bypassed HTTP request', async () => {
  const request = http.get(httpServer.http.url('/').href)

  const socketConnectListener = vi.fn()
  request.on('socket', (socket) => {
    socket.on('connect', socketConnectListener)
  })

  await toWebResponse(request)
  expect(socketConnectListener).toHaveBeenCalledOnce()
})

it('emits the "secureConnect" event for a mocked HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/').href)
  request.on('socket', (socket) => {
    socket
      .on('connect', () => connectListener('connect'))
      .on('secureConnect', () => connectListener('secureConnect'))
  })

  await toWebResponse(request)

  expect.soft(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect.soft(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect.soft(connectListener).toHaveBeenCalledTimes(2)
})

it('emits the "secureConnect" event for a bypassed HTTPS request', async () => {
  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/').href, {
    rejectUnauthorized: false,
  })
  request.on('socket', (socket) => {
    socket
      .on('connect', () => connectListener('connect'))
      .on('secureConnect', () => connectListener('secureConnect'))
  })

  await toWebResponse(request)

  expect.soft(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect.soft(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect.soft(connectListener).toHaveBeenCalledTimes(2)
})
