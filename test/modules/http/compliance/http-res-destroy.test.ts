// @vitest-environment node
import http from 'node:http'
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
   * on its own, and these tests only assert the response destroy behavior.
   */
  httpServer = await createTestHttpServer()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('emits the "error" event when a bypassed response is destroyed', async () => {
  const socketErrorListener = vi.fn()

  const request = http
    .get(httpServer.http.url('/').href)
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener)
    })
    .on('response', (response) => {
      response.destroy(new Error('reason'))
    })

  const [, rawResponse] = await toWebResponse(request)

  expect.soft(rawResponse.destroyed).toBe(true)
  expect
    .soft(socketErrorListener)
    .toHaveBeenCalledExactlyOnceWith(new Error('reason'))
})

it('emits the "error" event when a mocked response is destroyed', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const socketErrorListener = vi.fn()

  const request = http
    .get(httpServer.http.url('/').href)
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener)
    })
    .on('response', (response) => {
      response.destroy(new Error('reason'))
    })

  const [, rawResponse] = await toWebResponse(request)

  expect.soft(rawResponse.destroyed).toBe(true)
  expect
    .soft(socketErrorListener)
    .toHaveBeenCalledExactlyOnceWith(new Error('reason'))
})
