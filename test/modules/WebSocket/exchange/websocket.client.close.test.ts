/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterAll } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
})

it('closes the client connection with 1000 code when called "client.close()"', async () => {
  const socketClosePromise = new DeferredPromise<CloseEvent>()

  interceptor.once('connection', ({ client }) => {
    client.close()
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('close', (event) => {
    socketClosePromise.resolve(event)
  })

  const closeEvent = await socketClosePromise
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
})

it('closes the client connection with a custom error', async () => {
  const socketClosePromise = new DeferredPromise<CloseEvent>()

  interceptor.once('connection', ({ client }) => {
    client.close(3000, 'Oops!')
  })

  const ws = new WebSocket('wss://example.com')
  ws.addEventListener('close', (event) => {
    socketClosePromise.resolve(event)
  })

  const closeEvent = await socketClosePromise
  expect(closeEvent.code).toBe(3000)
  expect(closeEvent.reason).toBe('Oops!')
  /**
   * @note Closure is still clean regardless of the `code`.
   */
  expect(closeEvent.wasClean).toBe(true)
})
