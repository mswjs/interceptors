/**
 * @vitest-environment node-with-websocket
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import waitForExpect from 'wait-for-expect'
import {
  WebSocketClientConnection,
  WebSocketInterceptor,
} from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('removes the listener for the given event', async () => {
  const firstListener = vi.fn()
  const secondListener = vi.fn()

  let capturedClient: WebSocketClientConnection | undefined
  interceptor.once('connection', ({ client }) => {
    capturedClient = client
    client.addEventListener('message', firstListener)
    client.addEventListener('message', secondListener)
  })

  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => ws.send('hello')

  await waitForExpect(() => {
    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledTimes(1)
  })

  capturedClient?.removeEventListener('message', secondListener)
  ws.send('hello')

  await waitForExpect(() => {
    expect(firstListener).toHaveBeenCalledTimes(2)
    expect(secondListener).toHaveBeenCalledTimes(1)
  })
})
