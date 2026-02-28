// @vitest-environment node
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { HttpRequestInterceptor } from '../../../../src/interceptors/http'
import { toWebResponse } from '../../../helpers'

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

it('emits correct events for a mocked HTTPS request', async () => {
  interceptor.on('request', ({ controller }) => {
    controller.respondWith(new Response())
  })

  const request = https.get('https://any.localhost/api')

  const socketListener = vi.fn()
  const socketConnectListener = vi.fn()
  const socketReadyListener = vi.fn()
  const socketSecureListener = vi.fn()
  const socketSecureConnectListener = vi.fn()
  const socketSessionListener = vi.fn()
  const socketErrorListener = vi.fn()

  request.on('socket', (socket) => {
    socketListener(socket)

    socket
      .on('connect', socketConnectListener)
      .on('ready', socketReadyListener)
      .on('secure', socketSecureListener)
      .on('secureConnect', socketSecureConnectListener)
      .on('session', socketSessionListener)
      .on('error', socketErrorListener)
  })

  await toWebResponse(request)

  expect.soft(socketListener).toHaveBeenCalledOnce()
  expect.soft(socketReadyListener).toHaveBeenCalledOnce()
  expect.soft(socketConnectListener).toHaveBeenCalledOnce()
  expect.soft(socketSecureListener).toHaveBeenCalledOnce()
  expect.soft(socketSecureConnectListener).toHaveBeenCalledOnce()
  expect
    .soft(socketSessionListener)
    .toHaveBeenCalledExactlyOnceWith(expect.any(Buffer))
  expect.soft(socketErrorListener).not.toHaveBeenCalled()
})

it('emits correct events for a passthrough HTTPS request', async () => {
  const request = https.get(httpServer.https.url('/'), {
    rejectUnauthorized: false,
  })

  const socketListener = vi.fn()
  const socketConnectListener = vi.fn()
  const socketReadyListener = vi.fn()
  const socketSecureListener = vi.fn()
  const socketSecureConnectListener = vi.fn()
  const socketSessionListener = vi.fn()
  const socketErrorListener = vi.fn()

  request.on('socket', (socket) => {
    socketListener(socket)

    socket
      .on('connect', socketConnectListener)
      .on('ready', socketReadyListener)
      .on('secure', socketSecureListener)
      .on('secureConnect', socketSecureConnectListener)
      .on('session', socketSessionListener)
      .on('error', socketErrorListener)
  })

  await toWebResponse(request)

  expect.soft(socketListener).toHaveBeenCalledOnce()
  expect.soft(socketConnectListener).toHaveBeenCalledOnce()
  expect.soft(socketReadyListener).toHaveBeenCalledOnce()
  expect.soft(socketSecureListener).toHaveBeenCalledOnce()
  expect.soft(socketSecureConnectListener).toHaveBeenCalledOnce()
  expect.soft(socketSessionListener).toHaveBeenCalledTimes(2)
  expect
    .soft(socketSessionListener)
    .toHaveBeenNthCalledWith(1, expect.any(Buffer))
  expect
    .soft(socketSessionListener)
    .toHaveBeenNthCalledWith(2, expect.any(Buffer))
  expect.soft(socketErrorListener).not.toHaveBeenCalled()
})
