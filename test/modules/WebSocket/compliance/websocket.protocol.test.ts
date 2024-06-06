/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-close
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('returns an empty string if no protocol was provided', async () => {
  const ws = new WebSocket('wss://example.com')
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('')
})

it('returns the protocol if a single protocol was provided', async () => {
  const ws = new WebSocket('wss://example.com', 'chat')

  // The protocol is empty on the first tick.
  // This is where the client is waiting for the "server"
  // to report back what protocol was chosen.
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('chat')
})

it('returns the first protocol if an array of protocols was provided', async () => {
  const ws = new WebSocket('wss://example.com', ['superchat', 'chat'])
  expect(ws.protocol).toBe('')

  await waitForWebSocketEvent('open', ws)
  expect(ws.protocol).toBe('superchat')
})
