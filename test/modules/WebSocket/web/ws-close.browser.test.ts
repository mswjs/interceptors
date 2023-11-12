import { test, expect } from '../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

declare namespace window {
  export const interceptor: WebSocketInterceptor
}

test('emits the "close" event upon successful close', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('./ws-empty.runtime.js'))

  const closeEvent = await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', (connection) => {
      // Close the connection immediately.
      connection.close()
    })

    const ws = new WebSocket('ws://non-existing-host.com')

    return new Promise((resolve, reject) => {
      ws.addEventListener('error', (error) => reject(error))

      ws.addEventListener('close', (event) => {
        resolve({
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        })
      })
    })
  })

  await page.pause()

  expect(closeEvent).toEqual({
    code: 1000,
    reason: undefined,
    wasClean: true,
  })
})
