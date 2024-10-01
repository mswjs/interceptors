// @vitest-environment node-with-websocket
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { DeferredPromise } from '@open-draft/deferred-promise'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('throws an error when accessing "server.socket" before calling "server.connect()"', async () => {
  const socketPromise = new DeferredPromise<WebSocket>()
  interceptor.on('connection', ({ server }) => {
    try {
      // Accessing "server.socket" before calling "server.connect()" is a no-op.
      const socket = server.socket
      socketPromise.resolve(socket)
    } catch (error) {
      socketPromise.reject(error)
    }
  })

  const clientSocket = new WebSocket('wss://localhost')
  await waitForWebSocketEvent('open', clientSocket)

  await expect(socketPromise).rejects.toThrow(
    'Cannot access "socket" on the original WebSocket server object: the connection is not open. Did you forget to call `server.connect()`?'
  )

  // Client connection must remain open.
  expect(clientSocket.readyState).toBe(WebSocket.OPEN)
})

it('returns the WebSocket instance after calling "server.connect()"', async () => {
  const socketPromise = new DeferredPromise<WebSocket>()
  interceptor.on('connection', ({ server }) => {
    server.connect()
    try {
      const socket = server.socket
      socketPromise.resolve(socket)
    } catch (error) {
      socketPromise.reject(error)
    }
  })

  await waitForWebSocketEvent('open', new WebSocket('wss://localhost'))

  const serverSocket = await socketPromise
  expect(serverSocket).toBeInstanceOf(WebSocket)
  expect(serverSocket.url).toBe('wss://localhost/')
  expect(serverSocket.readyState).toBe(WebSocket.CONNECTING)
})
