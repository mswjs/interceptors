/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org//#dom-websocket-websocket
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

it('uses the "ws" scheme as-is', () => {
  expect(new WebSocket('ws://localhost:5678/api').url).toBe(
    'ws://localhost:5678/api'
  )
})

it('uses the "wss" scheme as-is', () => {
  expect(new WebSocket('wss://localhost:5678/api').url).toBe(
    'wss://localhost:5678/api'
  )
})

it('replaces the "http" scheme with "ws"', () => {
  expect(new WebSocket('http://localhost:5678/api').url).toBe(
    'ws://localhost:5678/api'
  )
})

it('replaces the "https" scheme with "wss"', () => {
  expect(new WebSocket('https://localhost:5678/api').url).toBe(
    'wss://localhost:5678/api'
  )
})

it('throws an error on not allowed schemes', () => {
  expect(() => new WebSocket('invalid-protocol://localhost')).toThrow(
    expect.objectContaining({
      name: 'SyntaxError',
      message: `Failed to construct 'WebSocket': The URL's scheme must be either 'http', 'https', 'ws', or 'wss'. 'invalid-protocol:' is not allowed.`,
    })
  )
})

it('throws on a relative URL in Node.js', () => {
  expect(() => new WebSocket('/not-allowed')).toThrow(
    expect.objectContaining({
      name: 'TypeError',
      code: 'ERR_INVALID_URL',
      message: 'Invalid URL',
    })
  )
})

it('ensures trailing slash where appropriate', () => {
  expect(new WebSocket('wss://localhost:5678').url).toBe(
    'wss://localhost:5678/'
  )
  expect(new WebSocket('wss://localhost:5678/').url).toBe(
    'wss://localhost:5678/'
  )

  expect(new WebSocket('wss://127.0.0.1:5678').url).toBe(
    'wss://127.0.0.1:5678/'
  )
  expect(new WebSocket('wss://127.0.0.1:5678/').url).toBe(
    'wss://127.0.0.1:5678/'
  )

  expect(new WebSocket('wss://non-existing.com').url).toBe(
    'wss://non-existing.com/'
  )
  expect(new WebSocket('wss://non-existing.com/').url).toBe(
    'wss://non-existing.com/'
  )

  expect(new WebSocket('wss://localhost:5678/foo').url).toBe(
    'wss://localhost:5678/foo'
  )
})
