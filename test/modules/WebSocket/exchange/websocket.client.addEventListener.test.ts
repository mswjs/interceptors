/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import waitForExpect from 'wait-for-expect'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('adds event listener for the "message" event', async () => {
  const messageListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', messageListener)
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.send('hello')

  await waitForExpect(() => {
    expect(messageListener).toHaveBeenCalledTimes(1)
    expect(messageListener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'hello',
      })
    )
  })
})

it('adds event listener for the "close" event', async () => {
  const closeListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('close', closeListener)
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.close()

  await waitForExpect(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
    expect(closeListener).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 1000,
        reason: '',
        wasClean: true,
      })
    )
  })
})
