// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

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

it('simulates connection error by throwing inside the "connection" listener', async () => {
  interceptor.on('connection', () => {
    throw new Error('Mocked connection error')
  })

  const socket = new WebSocket('wss://example.com')

  const openListener = vi.fn()
  const closeListener = vi.fn()
  const errorListener = vi.fn()

  socket.onopen = openListener
  socket.onerror = errorListener
  socket.onclose = closeListener

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalledOnce()
  })

  expect(openListener).not.toHaveBeenCalled()
  expect(closeListener).toHaveBeenCalledOnce()
  expect(closeListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'close',
      // Mark the closure as a server error.
      code: 1011,
      // Must include the error as the closure reason.
      reason: 'Mocked connection error',
    })
  )
  expect(socket.readyState).toBe(WebSocket.CLOSED)
})
