// @vitest-environment node
import http from 'node:http'
import { HttpServer } from '@open-draft/test-server/lib/http'
import { HttpRequestInterceptor } from '#/src/interceptors/http'
import { toWebResponse } from '#/test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => res.sendStatus(200))
})

const interceptor = new HttpRequestInterceptor()

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
    .get(httpServer.http.url('/'))
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
