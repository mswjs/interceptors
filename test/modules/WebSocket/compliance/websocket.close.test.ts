/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-close
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForNextTick } from '../utils/waitForNextTick'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('errors when calling "close" with a non-configurable status code', () => {
  const ws = new WebSocket('wss://example.com')
  expect(() => {
    ws.close(1003)
  }).toThrow('InvalidAccessError: close code out of user configurable range')
})

it('closes the connection normally given no status code', async () => {
  const closeEventPromise = new DeferredPromise<CloseEvent>()
  const errorListener = vi.fn()

  const ws = new WebSocket('wss://example.com')
  ws.onerror = errorListener
  ws.onclose = closeEventPromise.resolve
  ws.close()

  expect(ws.readyState).toBe(WebSocket.CLOSING)

  const closeEvent = await closeEventPromise
  expect(ws.readyState).toBe(WebSocket.CLOSED)
  expect(errorListener).not.toHaveBeenCalled()
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
})

it('closes the connection with a custom code and reason', async () => {
  const closeEventPromise = new DeferredPromise<CloseEvent>()
  const errorListener = vi.fn()

  const ws = new WebSocket('wss://example.com')
  ws.onerror = errorListener
  ws.onclose = closeEventPromise.resolve
  ws.close(3000, 'Oops!')

  expect(ws.readyState).toBe(WebSocket.CLOSING)

  const closeEvent = await closeEventPromise
  expect(ws.readyState).toBe(WebSocket.CLOSED)
  expect(errorListener).not.toHaveBeenCalled()
  expect(closeEvent.code).toBe(3000)
  expect(closeEvent.reason).toBe('Oops!')
  expect(closeEvent.wasClean).toBe(false)
})

it('removes all listeners after calling "close"', async () => {
  const ws = new WebSocket('wss://example.com')
  ws.onopen = () => {}
  ws.onmessage = () => {}
  ws.onclose = () => {}
  ws.onerror = () => {}

  ws.close()

  // Listeners are preserved on this tick
  // so they can react to the close event.
  expect(ws.onopen).not.toBeNull()
  expect(ws.onmessage).not.toBeNull()
  expect(ws.onclose).not.toBeNull()
  expect(ws.onerror).not.toBeNull()

  await waitForNextTick()

  expect(ws.onopen).toBeNull()
  expect(ws.onmessage).toBeNull()
  expect(ws.onclose).toBeNull()
  expect(ws.onerror).toBeNull()
})
