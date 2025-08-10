// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { getWsUrl } from '../utils/getWsUrl'

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

const interceptor = new WebSocketInterceptor()

beforeAll(async () => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
  wsServer.clients.forEach((client) => client.close())
})

afterAll(async () => {
  interceptor.dispose()
  wsServer.close()
})

it('allows reusing the same function for multiple client listeners', async () => {
  const clientMessageListener = vi.fn()

  interceptor.on('connection', ({ client }) => {
    client.addEventListener('message', clientMessageListener)
    client.addEventListener('message', clientMessageListener)
    client.addEventListener('message', clientMessageListener)

    /**
     * @note Use `process.nextTick()` because `queueMicrotask()` has a
     * higher priority. We need the connection to open, handle messages,
     * and then close.
     */
    process.nextTick(() => {
      client.close()
    })
  })

  const socket = new WebSocket('wss://example.com')
  socket.onopen = () => socket.send('hello world')

  await waitForWebSocketEvent('close', socket)

  /**
   * @note The same event listener for the same event is deduped.
   * It will only be called once. That is correct.
   */
  expect(clientMessageListener).toHaveBeenCalledTimes(1)
})

it('allows reusing the same function for multiple server listeners', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hello from server')
    queueMicrotask(() => ws.close())
  })

  const serverMessageListener = vi.fn()

  interceptor.on('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', serverMessageListener)
    server.addEventListener('message', serverMessageListener)
    server.addEventListener('message', serverMessageListener)
  })

  const socket = new WebSocket(getWsUrl(wsServer))

  await waitForWebSocketEvent('close', socket)

  /**
   * @note The same event listener for the same event is deduped.
   * It will only be called once. That is correct.
   */
  expect(serverMessageListener).toHaveBeenCalledTimes(1)
})
