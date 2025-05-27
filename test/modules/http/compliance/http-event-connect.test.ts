/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import http from 'node:http'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest/index'
import { waitForClientRequest } from '../../../../test/helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('original')
  })
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

it('emits the "connect" event for a mocked request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn()
  const request = http.get(httpServer.http.url('/'))
  request.on('socket', (socket) => {
    socket.on('connect', connectListener)
  })

  await waitForClientRequest(request)

  expect(connectListener).toHaveBeenCalledTimes(1)
})

it('emits the "connect" event for a bypassed request', async () => {
  const connectListener = vi.fn()
  const request = http.get(httpServer.http.url('/'))
  request.on('socket', (socket) => {
    socket.on('connect', connectListener)
  })

  await waitForClientRequest(request)

  expect(connectListener).toHaveBeenCalledTimes(1)
})

it('emits the "secureConnect" event for a mocked HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response('hello world'))
  })

  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/'))
  request.on('socket', (socket) => {
    socket.on('connect', () => connectListener('connect'))
    socket.on('secureConnect', () => connectListener('secureConnect'))
  })

  await waitForClientRequest(request)

  expect(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect(connectListener).toHaveBeenCalledTimes(2)
})

it('emits the "secureConnect" event for a mocked HTTPS request', async () => {
  const connectListener = vi.fn<(input: string) => void>()
  const request = https.get(httpServer.https.url('/'), {
    rejectUnauthorized: false,
  })
  request.on('socket', (socket) => {
    socket.on('connect', () => connectListener('connect'))
    socket.on('secureConnect', () => connectListener('secureConnect'))
  })

  await waitForClientRequest(request)

  expect(connectListener).toHaveBeenNthCalledWith(1, 'connect')
  expect(connectListener).toHaveBeenNthCalledWith(2, 'secureConnect')
  expect(connectListener).toHaveBeenCalledTimes(2)
})
