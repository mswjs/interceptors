// @vitest-environment node-with-websocket
import { WebSocketInterceptor } from '@mswjs/interceptors/WebSocket'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { getTestServer } from '#/test/setup/vitest'

const server = getTestServer()
const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('allows reusing the same function for multiple client listeners', async () => {
  const clientMessageListener = vi.fn()

  interceptor.on('connection', ({ client }) => {
    client.addEventListener('message', clientMessageListener)
    client.addEventListener('message', clientMessageListener)
    client.addEventListener('message', clientMessageListener)

    /**
     * @note Use a macrotask because `queueMicrotask()` has a
     * higher priority. We need the connection to open, handle messages,
     * and then close.
     */
    globalThis.setTimeout(() => {
      client.close()
    }, 0)
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
  const serverMessageListener = vi.fn()

  interceptor.on('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', serverMessageListener)
    server.addEventListener('message', serverMessageListener)
    server.addEventListener('message', serverMessageListener)
  })

  // The actual server greets the client, then closes the connection.
  const socket = new WebSocket(server.ws.url('/?greet&close'))

  await waitForWebSocketEvent('close', socket)

  /**
   * @note The same event listener for the same event is deduped.
   * It will only be called once. That is correct.
   */
  expect(serverMessageListener).toHaveBeenCalledTimes(1)
})
