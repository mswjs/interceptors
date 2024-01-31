/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#the-websocket-interface
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('sets the static ready state properties', () => {
  expect(WebSocket.CONNECTING).toBe(0)
  expect(WebSocket.OPEN).toBe(1)
  expect(WebSocket.CLOSING).toBe(2)
  expect(WebSocket.CLOSED).toBe(3)
})

it('sets the instance ready state properties', () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.CONNECTING).toBe(0)
  expect(ws.OPEN).toBe(1)
  expect(ws.CLOSING).toBe(2)
  expect(ws.CLOSED).toBe(3)
})

it('sets the "url" property to the passed URL', () => {
  expect(new WebSocket('wss://example.com')).toHaveProperty(
    'url',
    'wss://example.com'
  )
  expect(new WebSocket(new URL('wss://example.com'))).toHaveProperty(
    'url',
    'wss://example.com/'
  )

  expect(new WebSocket('ws://example.com')).toHaveProperty(
    'url',
    'ws://example.com'
  )
  expect(new WebSocket(new URL('ws://example.com'))).toHaveProperty(
    'url',
    'ws://example.com/'
  )
})

it('sets "protocol" to an empty string by default', () => {
  // This value changes once the connection is open.
  expect(new WebSocket('wss://example.com')).toHaveProperty('protocol', '')
})

it('sets "readyState" to 0 by default', () => {
  expect(new WebSocket('wss://example.com')).toHaveProperty('readyState', 0)
})

it('sets the "binaryType" to "blob" by default', () => {
  expect(new WebSocket('wss://example.com')).toHaveProperty(
    'binaryType',
    'blob'
  )
})

it('sets "bufferedAmount" to 0 by default', () => {
  expect(new WebSocket('wss://example.com')).toHaveProperty('bufferedAmount', 0)
})

it('sets "extensions" to an empty string by default', () => {
  // This value changes after the connection is open.
  expect(new WebSocket('wss://example.com')).toHaveProperty('extensions', '')
})

it('sets the event setters to null by default', () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.onopen).toBeNull()
  expect(ws.onmessage).toBeNull()
  expect(ws.onerror).toBeNull()
  expect(ws.onclose).toBeNull()
})
