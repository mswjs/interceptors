/**
 * @vitest-environment node-with-websocket
 * This test suite asserts that the "client" connection object
 * dispatches the right events in different scenarios.
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import {
  WebSocketData,
  WebSocketInterceptor,
} from '../../../../src/interceptors/WebSocket'
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

it('emits "message" event when the client sends data', async () => {
  const messageListener = vi.fn<[WebSocket, MessageEvent<WebSocketData>]>()
  const errorListener = vi.fn()
  interceptor.once('connection', ({ client }) => {
    client.addEventListener('message', function (event) {
      messageListener(this, event)
      queueMicrotask(() => client.close())
    })
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.send('hello')
  ws.onerror = errorListener

  await waitForWebSocketEvent('close', ws)

  const [thisArg, messageEvent] = messageListener.mock.calls[0]

  expect(thisArg).toEqual(ws)
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
    client.addEventListener('close', function (event) {
      closeListener(this, event)
    })
  })

  const ws = new WebSocket('wss://localhost')
  ws.onopen = () => ws.close(3123)

  await vi.waitFor(() => {
    const [thisArg, closeEvent] = closeListener.mock.calls[0]

    expect(thisArg).toEqual(ws)
    expect(closeEvent.type).toBe('close')
    expect(closeEvent.code).toBe(3123)
    expect(closeEvent.reason).toBe('')
    expect(closeEvent.wasClean).toBe(false)
    expect(closeEvent.currentTarget).toEqual(ws)
    expect(closeEvent.target).toEqual(ws)

    expect(closeListener).toHaveBeenCalledTimes(1)
  })
})

it('emits "error" event on client connection failure', async () => {
  // Connecting to a non-existing server URL without any
  // interceptor listener set up MUST establish the connection as-is
  // (no "open" event; "error" event; no "close" event).
  const ws = new WebSocket('wss://localhost/non-existing-url')

  const openListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  ws.onopen = openListener
  ws.onerror = errorListener
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(openListener).not.toHaveBeenCalled()
    expect(errorListener).toHaveBeenCalledTimes(1)
    expect(closeListener).not.toHaveBeenCalled()
  })
})

it('does not emit "error" event on user non-configurable closure codes', async () => {})
