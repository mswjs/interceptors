// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { waitForNextTick } from '../utils/waitForNextTick'

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

it('dispatches the connection even when the client "readyState" is OPEN', async () => {
  const readyStateListener = vi.fn<(input: number) => void>()

  interceptor.on('connection', ({ client }) => {
    // CONNECTING.
    readyStateListener(client.socket.readyState)

    /**
     * @note Use `process.nextTick()` because it has lower priority
     * than `queueMicrotask()`. If you queue a microtask here, it will
     * run BEFORE a queued microtask that dispatches the open event.
     */
    process.nextTick(() => {
      readyStateListener(client.socket.readyState)
      client.close()
    })
  })

  const socket = new WebSocket('wss://localhost')
  await waitForWebSocketEvent('close', socket)

  // The client ready state must be OPEN when the connection listener is called.
  expect(readyStateListener).toHaveBeenNthCalledWith(1, WebSocket.CONNECTING)
  expect(readyStateListener).toHaveBeenNthCalledWith(2, WebSocket.OPEN)
  expect(readyStateListener).toHaveBeenCalledTimes(2)
})

it('updates "readyState" correctly when closing the connection in the interceptor', async () => {
  const readyStateListener = vi.fn<(input: number) => void>()

  interceptor.on('connection', ({ client }) => {
    // CONNECTING.
    readyStateListener(client.socket.readyState)

    client.close()

    // CLOSING.
    readyStateListener(client.socket.readyState)

    process.nextTick(() => {
      // CLOSED.
      readyStateListener(client.socket.readyState)
    })
  })

  const openEventListener = vi.fn()
  const socket = new WebSocket('wss://localhost')
  socket.onopen = openEventListener
  await waitForWebSocketEvent('close', socket)

  expect(readyStateListener).toHaveBeenNthCalledWith(1, WebSocket.CONNECTING)
  // Must set ready state to CLOSING in the same frame as "client.close()".
  expect(readyStateListener).toHaveBeenNthCalledWith(2, WebSocket.CLOSING)

  await waitForNextTick()
  // Must set ready state to CLOSED in the next frame.
  expect(readyStateListener).toHaveBeenNthCalledWith(3, WebSocket.CLOSED)

  expect(openEventListener).not.toHaveBeenCalled()
})
