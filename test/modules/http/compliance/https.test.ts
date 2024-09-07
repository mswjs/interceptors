/**
 * @vitest-environment node
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import https from 'node:https'
import { HttpServer } from '@open-draft/test-server/http'
import { ClientRequestInterceptor } from '../../../../src/interceptors/ClientRequest'
import { waitForClientRequest } from '../../../helpers'

const httpServer = new HttpServer((app) => {
  app.get('/', (req, res) => {
    res.send('hello')
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

it('emits correct events for a mocked HTTPS request', async () => {
  interceptor.once('request', ({ controller }) => {
    controller.respondWith(new Response())
  })

  const request = https.get('https://example.com')

  const socketListener = vi.fn()
  const socketReadyListener = vi.fn()
  const socketSecureListener = vi.fn()
  const socketSecureConnectListener = vi.fn()
  const socketSessionListener = vi.fn()
  const socketErrorListener = vi.fn()

  request.on('socket', (socket) => {
    socketListener(socket)

    socket.on('ready', socketReadyListener)
    socket.on('secure', socketSecureListener)
    socket.on('secureConnect', socketSecureConnectListener)
    socket.on('session', socketSessionListener)
    socket.on('error', socketErrorListener)
  })

  await waitForClientRequest(request)

  // Must emit the correct events for a TLS connection.
  expect(socketListener).toHaveBeenCalledOnce()
  expect(socketReadyListener).toHaveBeenCalledOnce()
  expect(socketSecureListener).toHaveBeenCalledOnce()
  expect(socketSecureConnectListener).toHaveBeenCalledOnce()
  expect(socketSessionListener).toHaveBeenCalledTimes(2)
  expect(socketSessionListener).toHaveBeenNthCalledWith(1, expect.any(Buffer))
  expect(socketSessionListener).toHaveBeenNthCalledWith(2, expect.any(Buffer))
  expect(socketErrorListener).not.toHaveBeenCalled()
})

it('emits correct events for a passthrough HTTPS request', async () => {
  const request = https.get(httpServer.https.url('/'), {
    rejectUnauthorized: false,
  })

  const socketListener = vi.fn()
  const socketReadyListener = vi.fn()
  const socketSecureListener = vi.fn()
  const socketSecureConnectListener = vi.fn()
  const socketSessionListener = vi.fn()
  const socketErrorListener = vi.fn()

  request.on('socket', (socket) => {
    socketListener(socket)

    socket.on('ready', socketReadyListener)
    socket.on('secure', socketSecureListener)
    socket.on('secureConnect', socketSecureConnectListener)
    socket.on('session', socketSessionListener)
    socket.on('error', socketErrorListener)
  })

  await waitForClientRequest(request)

  // Must emit the correct events for a TLS connection.
  expect(socketListener).toHaveBeenCalledOnce()
  expect(socketReadyListener).toHaveBeenCalledOnce()
  expect(socketSecureListener).toHaveBeenCalledOnce()
  expect(socketSecureConnectListener).toHaveBeenCalledOnce()
  expect(socketSessionListener).toHaveBeenCalledTimes(2)
  expect(socketSessionListener).toHaveBeenNthCalledWith(1, expect.any(Buffer))
  expect(socketSessionListener).toHaveBeenNthCalledWith(2, expect.any(Buffer))
  expect(socketErrorListener).not.toHaveBeenCalled()
})
