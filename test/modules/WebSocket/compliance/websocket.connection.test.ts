/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits the correct connection event', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com')

  await vi.waitFor(() => {
    expect(connectionListener).toHaveBeenCalledTimes(1)
    expect(connectionListener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        client: expect.objectContaining({
          id: expect.any(String),
          send: expect.any(Function),
          addEventListener: expect.any(Function),
          removeEventListener: expect.any(Function),
          close: expect.any(Function),
        }),
        server: expect.objectContaining({
          send: expect.any(Function),
          addEventListener: expect.any(Function),
          removeEventListener: expect.any(Function),
        }),
      })
    )
  })
})
