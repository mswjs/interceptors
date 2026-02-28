// @vitest-environment node
/**
 * @see https://github.com/mswjs/msw/issues/2537
 * @see https://github.com/mswjs/interceptors/pull/755
 */
import http from 'node:http'
import { Socket } from 'node:net'
import { HttpServer } from '@open-draft/test-server/http'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/resource', async (req, res) => {
    res.send('ok')
  })
})

const interceptor = new HttpRequestInterceptor()

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

  const [response] = await toWebResponse(request)

  expect.soft(response.status).toBe(200)
  await expect.soft(response.text()).resolves.toBe('ok')
})
