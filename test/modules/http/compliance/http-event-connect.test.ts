// @vitest-environment node
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { waitForClientRequest } from '../../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('original')
  })
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

it('emits the "connect" event for a mocked HTTP request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn()
  const request = http.get(httpServer.http.url('/'))
  request.on('socket', (socket) => {
    socket.on('connect', connectListener)
  })

  await waitForClientRequest(request)

  expect(connectListener).toHaveBeenCalledOnce()
})

it('emits the "connect" event for a bypassed HTTP request', async () => {
  const request = http.get(httpServer.http.url('/'))

  const socketConnectListener = vi.fn()
  request.on('socket', (socket) => {
    socket.on('connect', socketConnectListener)
  })

  await waitForClientRequest(request)
  expect(socketConnectListener).toHaveBeenCalledOnce()
})

it('emits the "secureConnect" event for a mocked HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/'))
  request.on('socket', (socket) => {
    socket
      .on('connect', () => connectListener('connect'))
      .on('secureConnect', () => connectListener('secureConnect'))
  })

  await waitForClientRequest(request)

  expect.soft(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect.soft(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect.soft(connectListener).toHaveBeenCalledTimes(2)
})

it('emits the "secureConnect" event for a bypassed HTTPS request', async () => {
  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/'), {
    rejectUnauthorized: false,
  })
  request.on('socket', (socket) => {
    socket
      .on('connect', () => connectListener('connect'))
      .on('secureConnect', () => connectListener('secureConnect'))
  })

  await waitForClientRequest(request)

  expect.soft(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect.soft(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect.soft(connectListener).toHaveBeenCalledTimes(2)
})
