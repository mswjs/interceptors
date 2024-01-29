import { WebSocketServer } from 'ws'
import { HttpServer } from '@open-draft/test-server/http'
import { test, expect } from '../../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'

declare global {
  interface Window {
    interceptor: WebSocketInterceptor
  }
}

const httpServer = new HttpServer()
const wsServer = new WebSocketServer({
  server: httpServer['_http'],
})

function getWebSocketUrl(ws: WebSocketServer): string {
  const address = ws.address()
  if (typeof address === 'string') {
    return address
  }
  return `ws://${address.address}:${address.port}`
}

test.beforeAll(async () => {
  await httpServer.listen()
})

test.afterEach(() => {
  wsServer.removeAllListeners('connection')
})

test.afterAll(async () => {
  await httpServer.close()
  await new Promise<void>((resolve, reject) => {
    wsServer.close((error) => {
      if (error) reject(error)
      resolve()
    })
  })
})

test('forwards incoming server data from the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  wsServer.on('connection', (ws): void => {
    ws.send('hello from server')
  })

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', async ({ server }) => {
      server.connect()
    })
    interceptor.apply()
  })

  const receivedString = await page.evaluate((wsUrl) => {
    const ws = new WebSocket(wsUrl)

    return new Promise<string>((resolve) => {
      ws.addEventListener('message', (event) => resolve(event.data))
    })
  }, getWebSocketUrl(wsServer))

  expect(receivedString).toBe('hello from server')
})

test('forwards outgoing client data to the original server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../websocket.runtime.js'))

  wsServer.on('connection', (ws): void => {
    ws.on('message', function message(data) {
      ws.send(`Hello, ${data}!`)
    })
  })

  await page.evaluate(() => {
    const { interceptor } = window

    interceptor.on('connection', ({ client, server }) => {
      server.connect()

      // Forward outgoing events to the original WebSocket server.
      client.on('message', (event) => server.send(event.data))
    })
    interceptor.apply()
  })

  const receivedString = await page.evaluate((wsUrl) => {
    const ws = new WebSocket(wsUrl)

    return new Promise<string>((resolve) => {
      ws.addEventListener('open', () => ws.send('John'))
      ws.addEventListener('message', (event) => resolve(event.data))
    })
  }, getWebSocketUrl(wsServer))

  expect(receivedString).toBe('Hello, John!')
})
