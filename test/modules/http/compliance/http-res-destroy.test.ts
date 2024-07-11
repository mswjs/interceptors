// @vitest-environment node
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import http from 'node:http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { HttpServer } from '@open-draft/test-server/lib/http'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => res.sendStatus(200))
})

const interceptor = new ClientRequestInterceptor()

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

it('emits the "error" event when a bypassed response is destroyed', async () => {
  const socketErrorListener = vi.fn()

  const request = http
    .get(httpServer.http.url('/'))
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener)
    })
    .on('response', (response) => {
      response.destroy(new Error('reason'))
    })

  const { res } = await waitForClientRequest(request)

  expect(res.destroyed).toBe(true)
  expect(socketErrorListener).toHaveBeenCalledOnce()
  expect(socketErrorListener).toHaveBeenCalledWith(new Error('reason'))
})

it('emits the "error" event when a mocked response is destroyed', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const socketErrorListener = vi.fn()

  const request = http
    .get(httpServer.http.url('/'))
    .on('socket', (socket) => {
      socket.on('error', socketErrorListener)
    })
    .on('response', (response) => {
      response.destroy(new Error('reason'))
    })

  const { res } = await waitForClientRequest(request)

  expect(res.destroyed).toBe(true)
  expect(socketErrorListener).toHaveBeenCalledOnce()
  expect(socketErrorListener).toHaveBeenCalledWith(new Error('reason'))
})
