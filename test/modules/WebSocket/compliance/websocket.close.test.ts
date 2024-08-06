/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-close
 */
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForNextTick } from '../utils/waitForNextTick'
import { getWsUrl } from '../utils/getWsUrl'

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('errors when calling "close" with a non-configurable status code', () => {
  const ws = new WebSocket(getWsUrl(wsServer))
  expect(() => {
    ws.close(1003)
  }).toThrow('InvalidAccessError: close code out of user configurable range')
})

it('closes the connection gracefully given no closure code', async () => {
  const ws = new WebSocket(getWsUrl(wsServer))
  const closeListener = vi.fn()
  const errorListener = vi.fn()
  ws.onerror = errorListener
  ws.onclose = closeListener
  ws.onopen = () => ws.close()

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })
  expect(ws.readyState).toBe(WebSocket.CLOSED)

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)

  // Graceful connection closures do NOT result in errors.
  expect(errorListener).not.toHaveBeenCalled()
})

it('closes the connection with a custom code and reason', async () => {
  const ws = new WebSocket(getWsUrl(wsServer))
  const closeListener = vi.fn()
  const errorListener = vi.fn()
  ws.onerror = errorListener
  ws.onclose = closeListener
  ws.onopen = () => ws.close(3000, 'Oops!')

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  expect(ws.readyState).toBe(WebSocket.CLOSED)

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.code).toBe(3000)
  expect(closeEvent.reason).toBe('Oops!')
  expect(closeEvent.wasClean).toBe(true)

  expect(errorListener).not.toHaveBeenCalled()
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
