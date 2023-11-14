import { WebSocketServer } from '@open-draft/test-server/ws'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'
import { test, expect } from '../../../../playwright.extend'

declare namespace window {
  export const interceptor: WebSocketInterceptor
}

const wsServer = new WebSocketServer()

test.beforeAll(async () => {
  await wsServer.listen()
})
test.afterAll(async () => {
  await wsServer.close()
})

test('emits the "open" event when connected to the actual server', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../ws-empty.runtime.js'))

  const connectionPromise = page.evaluate(() => {
    const { interceptor } = window

    return new Promise<boolean>((resolve) => {
      interceptor.apply()
      interceptor.on('connection', () => {
        // Do not handshake so that the connection to the
        // actual server is established instead.
        resolve(true)
      })
    })
  })

  const openListenerPromise = page.evaluate((url) => {
    const ws = new WebSocket(url)

    return new Promise<boolean>((resolve, reject) => {
      ws.onopen = () => resolve(true)
      ws.onerror = reject
    })
  }, wsServer.ws.address.href)

  await expect(openListenerPromise).resolves.toBe(true)
  await expect(connectionPromise).resolves.toBe(true)
})

test('emits the "open" event when mocked the connection', async ({
  loadExample,
  page,
}) => {
  await loadExample(require.resolve('../ws-empty.runtime.js'))

  const connectionPromise = page.evaluate(() => {
    const { interceptor } = window

    return new Promise<boolean>((resolve) => {
      interceptor.apply()
      interceptor.on('connection', (connection) => {
        connection.handshake()
        resolve(true)
      })
    })
  })

  const openListenerPromise = page.evaluate((url) => {
    const ws = new WebSocket(url)

    return new Promise<boolean>((resolve, reject) => {
      ws.onopen = () => resolve(true)
      ws.onerror = reject
    })
  }, wsServer.ws.address.href)

  await expect(connectionPromise).resolves.toBe(true)
  await expect(openListenerPromise).resolves.toBe(true)
})
