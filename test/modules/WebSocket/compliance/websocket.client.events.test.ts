/**
 * @vitest-environment node-with-websocket
 * This test suite asserts that the "client" connection object
 * dispatches the right events in different scenarios.
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import {
  WebSocketData,
  WebSocketInterceptor,
} from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('emits "message" event when the client sends data', async () => {
  const messageListener = vi.fn<[MessageEvent<WebSocketData>]>()
  const errorListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', (event) => {
      messageListener(event)
      queueMicrotask(() => client.close())
    })
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.send('hello')
  ws.onerror = errorListener

  await waitForWebSocketEvent('close', ws)

  const [messageEvent] = messageListener.mock.calls[0]

  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello')
  expect(messageEvent.currentTarget).toEqual(ws)
  expect(messageEvent.target).toEqual(ws)

  expect(messageListener).toHaveBeenCalledTimes(1)
  expect(errorListener).not.toHaveBeenCalled()
})

it('emits "close" event when the client closes itself', async () => {
  const closeListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('close', closeListener)
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.close(3123)

  await vi.waitFor(() => {
    const [closeEvent] = closeListener.mock.calls[0]

    expect(closeEvent.type).toBe('close')
    expect(closeEvent.code).toBe(3123)
    expect(closeEvent.reason).toBe('')
    expect(closeEvent.wasClean).toBe(false)
    expect(closeEvent.currentTarget).toEqual(ws)
    expect(closeEvent.target).toEqual(ws)

    expect(closeListener).toHaveBeenCalledTimes(1)
  })
})
