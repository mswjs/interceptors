// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2537
 * @see https://github.com/mswjs/interceptors/pull/755
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import { Socket } from 'node:net'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', async (req, res) => {
    res.send('ok')
  })
})

const interceptor = new ClientRequestInterceptor()

beforeAll(async () => {
  interceptor.apply()
  await httpServer.listen()
})

afterAll(async () => {
  interceptor.dispose()
  await httpServer.close()
})

it('removes all event listeners from a passthrough socket after closing', async () => {
  const request = http.get(httpServer.http.url('/resource'), {
    headers: { connection: 'close' },
  })
  const pendingSocket = new DeferredPromise<Socket>()

  request.once('socket', (socket) => {
    pendingSocket.resolve(socket)
  })

  const socket = await pendingSocket
  const { res, text } = await waitForClientRequest(request)

  expect.soft(res.statusCode).toBe(200)
  await expect.soft(text()).resolves.toBe('ok')

  const passthroughSocket = Reflect.get(socket, 'originalSocket') as Socket
  expect(passthroughSocket).toBeInstanceOf(Socket)

  await expect
    .poll(
      // @ts-expect-error Node.js internals
      () => passthroughSocket._events
    )
    .toEqual({})
})
