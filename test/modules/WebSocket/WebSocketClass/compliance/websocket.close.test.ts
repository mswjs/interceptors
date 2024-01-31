/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-close
 */
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'
import { DeferredPromise } from '@open-draft/deferred-promise'

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
