import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { setTimeout } from '#/test/setup/helpers-neutral'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'

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
     * @note Use a macrotask because it has lower priority
     * than `queueMicrotask()`. If you queue a microtask here, it will
     * run BEFORE a queued microtask that dispatches the open event.
     */
    globalThis.setTimeout(() => {
      readyStateListener(client.socket.readyState)
      client.close()
    }, 0)
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

    globalThis.setTimeout(() => {
      // CLOSED.
      readyStateListener(client.socket.readyState)
    }, 0)
  })

  const openEventListener = vi.fn()
  const socket = new WebSocket('wss://localhost')
  socket.onopen = openEventListener
  await waitForWebSocketEvent('close', socket)

  expect(readyStateListener).toHaveBeenNthCalledWith(1, WebSocket.CONNECTING)
  // Must set ready state to CLOSING in the same frame as "client.close()".
  expect(readyStateListener).toHaveBeenNthCalledWith(2, WebSocket.CLOSING)

  await setTimeout(0)
  // Must set ready state to CLOSED in the next frame.
  expect(readyStateListener).toHaveBeenNthCalledWith(3, WebSocket.CLOSED)

  expect(openEventListener).not.toHaveBeenCalled()
})
