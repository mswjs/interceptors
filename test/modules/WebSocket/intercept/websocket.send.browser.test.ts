import { test, expect } from '../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { WebSocketData } from '../../../../src/interceptors/WebSocket/WebSocketTransport'

declare global {
  interface Window {
    interceptor: WebSocketInterceptor
    outgoingData: WebSocketData
  }
}

test('errors when sending data before open', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))
  await page.evaluate(() => {
    const { interceptor } = window
    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const sendError = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')
    try {
      ws.send('no-op')
    } catch (error) {
      if (error instanceof Error) {
        return error.message
      }
    }
  })

  expect(sendError).toBe('InvalidStateError')
})

test('intercepts text sent over websocket', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.addEventListener(
        'message',
        (event) => (window.outgoingData = event.data)
      )
    })
    interceptor.apply()
  })

  await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')
    ws.addEventListener('open', () => ws.send('hello from client'))
  })

  const outgoingData = await page.evaluate(() => window.outgoingData)
  expect(outgoingData).toBe('hello from client')
})

test('intercepts Blob sent over websocket', async ({ loadExample, page }) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.addEventListener(
        'message',
        (event) => (window.outgoingData = event.data)
      )
    })
    interceptor.apply()
  })

  await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')
    ws.addEventListener('open', () =>
      ws.send(
        new Blob(['hello from client'], {
          type: 'text/plain',
        })
      )
    )
  })

  const outgoingData = await page.evaluate(() => {
    // Blobs don't serialize over MessageChannel.
    return (window.outgoingData as Blob).text()
  })
  expect(outgoingData).toBe('hello from client')
})

test('intercepts ArrayBuffer sent over websocket', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.addEventListener(
        'message',
        (event) => (window.outgoingData = event.data)
      )
    })
    interceptor.apply()
  })

  await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')
    ws.addEventListener('open', () =>
      ws.send(new TextEncoder().encode('hello from client'))
    )
  })

  const outgoingData = await page.evaluate(() => {
    return new TextDecoder().decode(window.outgoingData as Uint8Array)
  })
  expect(outgoingData).toBe('hello from client')
})

test('increases "bufferedAmount" before the data is sent', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window
    interceptor.apply()
    interceptor.on('connection', () => {})
  })

  const bufferedAmount = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise<{ beforeSend: number; afterSend: number }>((resolve) => {
      ws.addEventListener('open', () => {
        ws.send('hello from client')
        const beforeSend = ws.bufferedAmount

        queueMicrotask(() => {
          resolve({
            beforeSend,
            afterSend: ws.bufferedAmount,
          })
        })
      })
    })
  })

  expect(bufferedAmount.beforeSend).toBe(17)
  expect(bufferedAmount.afterSend).toBe(0)
})
