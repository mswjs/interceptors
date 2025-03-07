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
  vi.clearAllMocks()
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
  const closeCallback = vi.fn<(event: CloseEvent) => void>()
  const errorCallback = vi.fn()
  ws.onerror = errorCallback
  ws.onclose = closeCallback

  await vi.waitFor(() => {
    expect(errorCallback).toHaveBeenCalledOnce()
    expect(closeCallback).toHaveBeenCalledOnce()
  })

  expect(ws.readyState).toBe(WebSocket.CLOSED)

  const [closeEvent] = closeCallback.mock.calls[0]
  expect(closeEvent.code).toBe(1011)
  expect(closeEvent.reason).toBe('Interceptor error')
  /**
   * @note Since the connection has been aborted due to the
   * unhandled interceptor error, this closure is NOT clean.
   * In other words, the server/client closing handhsake couldn't
   * have happened (the process terminated due to the exception).
   */
  expect(closeEvent.wasClean).toBe(false)

  expect(console.error).toHaveBeenCalledWith(interceptorError)
})

it('does not emit "close" event twice on already closing WebSocket connections', async () => {
  const interceptorError = new Error('Interceptor error')
  interceptor.on('connection', ({ client }) => {
    client.close(1001, 'Custom close reason')
    throw interceptorError
  })

  const ws = new WebSocket('ws://localhost')
  const closeCallback = vi.fn<(event: CloseEvent) => void>()
  const errorCallback = vi.fn()
  ws.onerror = errorCallback
  ws.onclose = closeCallback

  await vi.waitFor(() => {
    expect(errorCallback).toHaveBeenCalledOnce()
  })

  expect(ws.readyState).toBe(WebSocket.CLOSED)

  expect(closeCallback).toHaveBeenCalledOnce()

  const [closeEvent] = closeCallback.mock.calls[0]
  expect(closeEvent.code).toBe(1001)
  expect(closeEvent.reason).toBe('Custom close reason')
  /**
   * @note Since the connection has been closed by the interceptor,
   * this closure is considered clean.
   */
  expect(closeEvent.wasClean).toBe(true)

  expect(console.error).toHaveBeenCalledWith(interceptorError)
})
