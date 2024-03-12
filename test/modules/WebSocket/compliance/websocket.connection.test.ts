/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { UUID_REGEXP } from '../../../helpers'
import { waitForNextTick } from '../utils/waitForNextTick'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits the correct "connection" event on the interceptor', async () => {
  const connectionListener = vi.fn()
  interceptor.once('connection', connectionListener)

  new WebSocket('wss://example.com')

  // Must not emit the "connection" event on this tick.
  expect(connectionListener).toHaveBeenCalledTimes(0)

  await waitForNextTick()

  // Must emit the "connection" event on the next tick
  // so the client can modify the WebSocket instance meanwhile.
  expect(connectionListener).toHaveBeenCalledTimes(1)
  expect(connectionListener).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      client: expect.objectContaining({
        id: expect.stringMatching(UUID_REGEXP),
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
