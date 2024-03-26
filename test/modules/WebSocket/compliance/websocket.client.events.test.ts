/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits "message" event when the client sends data', async () => {
  const messageListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', messageListener)
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.send('hello')

  await vi.waitFor(() => {
    expect(messageListener).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'hello',
        target: ws,
      })
    )
    expect(messageListener).toHaveBeenCalledTimes(1)
  })
})

it('emits "close" event when the client closes itself', async () => {
  const closeListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('close', closeListener)
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.close(3123)

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 3123,
        reason: '',
        wasClean: false,
        target: ws,
      })
    )
    expect(closeListener).toHaveBeenCalledTimes(1)
  })
})
