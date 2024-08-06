// @vitest-environment node-with-websocket
import { it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  interceptor.removeAllListeners()
  vi.resetAllMocks()
})

afterAll(() => {
  interceptor.dispose()
  vi.restoreAllMocks()
})

it('handles interceptor exception as WebSocket connection closure with error', async () => {
  const interceptorError = new Error('Interceptor error')
  interceptor.on('connection', () => {
    throw interceptorError
  })

  const ws = new WebSocket('ws://localhost')
  const closeListener = vi.fn<[CloseEvent]>()
  const errorListener = vi.fn()
  ws.onerror = errorListener
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalledOnce()
    expect(closeListener).toHaveBeenCalledOnce()
  })

  expect(ws.readyState).toBe(WebSocket.CLOSED)

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('Interceptor error')
  expect(closeEvent.wasClean).toBe(true)

  expect(console.error).toHaveBeenCalledWith(interceptorError)
})
