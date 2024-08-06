import { test, expect } from '../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

declare global {
  interface Window {
    interceptor: WebSocketInterceptor
  }
}

test('closes the client connection with 1000 code when called "client.close()"', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.close()
    })
    interceptor.apply()
  })

  const closeEvent = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise((resolve) => {
      ws.addEventListener('close', (event) => {
        resolve({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
      })
    })
  })

  expect(closeEvent).toEqual({ code: 1000, reason: '', wasClean: true })
})

test('closes the client connection with a custom error', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.close(3000, 'Oops!')
    })
    interceptor.apply()
  })

  const closeEvent = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise((resolve) => {
      ws.addEventListener('close', (event) => {
        resolve({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
      })
    })
  })

  expect(closeEvent).toEqual({
    code: 3000,
    reason: 'Oops!',
    wasClean: true,
  })
})
