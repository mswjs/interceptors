import { WebSocketServer } from 'ws'
import { test, expect } from '../../../playwright.extend'
import type { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { getWsUrl } from '../utils/getWsUrl'

declare global {
  interface Window {
    interceptor: WebSocketInterceptor
  }
}

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

test.afterEach(() => {
  wsServer.removeAllListeners('connection')
})

test.afterAll(async () => {
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
  }, getWsUrl(wsServer))

  expect(receivedString).toBe('hello from server')
})

test('forwards outgoing client data to the original server by default', async ({
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
    })
    interceptor.apply()
  })

  const receivedString = await page.evaluate((wsUrl) => {
    const ws = new WebSocket(wsUrl)

    return new Promise<string>((resolve) => {
      ws.addEventListener('open', () => ws.send('John'))
      ws.addEventListener('message', (event) => resolve(event.data))
    })
  }, getWsUrl(wsServer))

  expect(receivedString).toBe('Hello, John!')
})
