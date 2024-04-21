import { test, expect } from '../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'

declare global {
  interface Window {
    interceptor: WebSocketInterceptor
  }
}

test('receives incoming mock text data from the server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.send('hello from server')
    })
    interceptor.apply()
  })

  const receivedString = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise<string>((resolve) => {
      ws.addEventListener('message', (event) => {
        resolve(event.data)
      })
    })
  })

  expect(receivedString).toBe('hello from server')
})

test('receives incoming mock Blob data from the server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.send(new Blob(['blob from server']))
    })
    interceptor.apply()
  })

  const receivedBlob = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise<string>((resolve) => {
      ws.addEventListener('message', async (event) => {
        resolve(await (event.data as Blob).text())
      })
    })
  })

  expect(receivedBlob).toBe('blob from server')
})

test('receives incoming mock ArrayBuffer data from the server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.send(new TextEncoder().encode('buffer from server'))
    })
    interceptor.apply()
  })

  const receivedBuffer = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise<string>((resolve) => {
      ws.addEventListener('message', (event) => {
        resolve(new TextDecoder().decode(event.data))
      })
    })
  })

  expect(receivedBuffer).toBe('buffer from server')
})

test('receives mock data in response to sent event', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client }) => {
      client.addEventListener('message', (event) => {
        if (event.data === 'John') {
          client.send(`Hello, ${event.data}!`)
        }
      })
    })
    interceptor.apply()
  })

  const receivedString = await page.evaluate(() => {
    const ws = new WebSocket('wss://example.com')

    return new Promise<string>((resolve) => {
      ws.addEventListener('message', (event) => {
        resolve(event.data)
      })
      ws.addEventListener('open', () => {
        ws.send('Sarah')
        ws.send('John')
      })
    })
  })

  expect(receivedString).toBe('Hello, John!')
})
