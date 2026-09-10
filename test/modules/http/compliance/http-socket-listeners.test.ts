// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2537
 * @see https://github.com/mswjs/interceptors/pull/755
 */
import { once } from 'node:events'
import http from 'node:http'
import https from 'node:https'
import { Socket } from 'node:net'
import {
  createTestHttpServer,
  type TestHttpServer,
} from '@epic-web/test-server/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { TcpSocketController } from '#/src/interceptors/net/socket-controller'
import { toWebResponse } from '#/test/helpers'

let httpServer: TestHttpServer

const interceptor = new HttpRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  httpServer = await createTestHttpServer({
    protocols: ['http', 'https'],
    defineRoutes(router) {
      router.get('/resource', () => {
        return new Response('ok')
      })
    },
  })
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

/**
 * @see https://github.com/mswjs/interceptors/issues/828
 */
it('reuses an HTTPS connection without leaking event listeners', async () => {
  const agent = new https.Agent({
    keepAlive: true,
    maxSockets: 1,
    rejectUnauthorized: false,
  })
  onTestFinished(() => {
    agent.destroy()
  })
  using emitWarning = vi.spyOn(process, 'emitWarning')

  for (let requestIndex = 0; requestIndex < 15; requestIndex++) {
    const request = https.get(httpServer.https.url('/resource'), { agent })
    const [response] = await toWebResponse(request)

    await expect(response.text()).resolves.toBe('ok')
    expect(request.reusedSocket).toBe(requestIndex > 0)
  }

  expect(emitWarning).not.toHaveBeenCalled()
})

it('removes forwarding listeners from a closed HTTP connection', async () => {
  using passthrough = vi.spyOn(TcpSocketController.prototype, 'passthrough')
  const request = http.get(httpServer.http.url('/resource'))
  const [response] = await toWebResponse(request)
  const realSocket: Socket = passthrough.mock.results[0].value
  const dataListener = vi.fn()
  realSocket.on('data', dataListener)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('ok')
  const closed = once(realSocket, 'close')
  realSocket.destroy()
  await closed

  expect.soft(realSocket.listeners('data')).toEqual([dataListener])
  expect.soft(realSocket.listenerCount('connectionAttemptFailed')).toBe(0)
  expect.soft(realSocket.listenerCount('connectionAttemptTimeout')).toBe(0)
})

it('removes forwarding listeners from a closed HTTPS connection', async () => {
  using passthrough = vi.spyOn(TcpSocketController.prototype, 'passthrough')
  const request = https.get(httpServer.https.url('/resource'), {
    rejectUnauthorized: false,
  })
  const [response] = await toWebResponse(request)
  const realSocket: Socket = passthrough.mock.results[0].value
  const sessionListener = vi.fn()
  realSocket.on('session', sessionListener)
  const secureListenerCount = realSocket.listenerCount('secure')

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('ok')
  const closed = once(realSocket, 'close')
  realSocket.destroy()
  await closed

  expect.soft(realSocket.listeners('session')).toEqual([sessionListener])
  expect.soft(realSocket.listenerCount('secure')).toBe(secureListenerCount - 1)
  expect.soft(realSocket.listenerCount('keylog')).toBe(0)
  expect.soft(realSocket.listenerCount('OCSPResponse')).toBe(0)
  expect.soft(realSocket.listenerCount('data')).toBe(0)
})
