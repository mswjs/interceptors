// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { getWsUrl } from '../utils/getWsUrl'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(async () => {
  interceptor.removeAllListeners()

  for (const client of wsServer.clients) {
    client.close()
    await new Promise((resolve, reject) => {
      client.onerror = reject
      client.onclose = resolve
    })
  }
})

afterAll(async () => {
  interceptor.dispose()

  await new Promise<void>((resolve, reject) => {
    wsServer.close((error) => {
      if (error) reject(error)
      resolve()
    })
  })
})

it('emits "open" event when the server connection is open', async () => {
  const serverOpenListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('open', serverOpenListener)
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })
})

it('emits "open" event if the listener was added before calling "connect()"', async () => {
  const serverOpenListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('open', serverOpenListener)
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })
})

it('emits "close" event when the server connection is closed', async () => {
  wsServer.addListener('connection', (ws) => {
    queueMicrotask(() => ws.close())
  })

  const serverErrorListener = vi.fn()
  const serverCloseListener = vi.fn()

  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('error', serverErrorListener)
    server.addEventListener('close', serverCloseListener)
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverCloseListener).toHaveBeenCalledTimes(1)
  })

  expect(serverErrorListener).not.toHaveBeenCalled()
})

it('emits "close" event when the server connection is closed by the interceptor', async () => {
  const serverErrorListener = vi.fn()
  const serverCloseListener = vi.fn()

  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('error', serverErrorListener)
    server.addEventListener('close', serverCloseListener)
    /**
     * @note Make sure to close the connection AFTER it's been open.
     * Closing before open results in an error, and may lead to
     * false positive test results.
     */
    server.addEventListener('open', () => server.close())
  })

  new WebSocket(getWsUrl(wsServer))

  await vi.waitFor(() => {
    expect(serverCloseListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = serverCloseListener.mock.calls[0]
  expect(closeEvent).toHaveProperty('code', 1000)
  expect(closeEvent).toHaveProperty('reason', '')

  expect(serverErrorListener).not.toHaveBeenCalled()
})

it('emits both "error" and "close" events when the server connection errors', async () => {
  const clientCloseListener = vi.fn()
  const serverErrorListener = vi.fn()
  const serverCloseListener = vi.fn()

  interceptor.once('connection', ({ client, server }) => {
    client.addEventListener('close', clientCloseListener)

    server.connect()
    server.addEventListener('error', serverErrorListener)
    server.addEventListener('close', serverCloseListener)
  })

  /**
   * @note `server.connect()` will attempt to establish connection
   * to a valid, non-existing URL. That will trigger an error.
   */
  const client = new WebSocket('https://example.com/non-existing-url')

  const instanceErrorListener = vi.fn()
  const instanceCloseListener = vi.fn()
  client.addEventListener('error', instanceErrorListener)
  client.addEventListener('close', instanceCloseListener)

  await vi.waitFor(() => {
    expect(serverErrorListener).toHaveBeenCalledTimes(1)
  })

  // Must not emit the "close" event because the connection
  // was never established (it errored).
  expect(serverCloseListener).not.toHaveBeenCalled()
  expect(clientCloseListener).not.toHaveBeenCalled()
  expect(instanceCloseListener).not.toHaveBeenCalled()

  // Must emit the correct events on the WebSocket client.
  expect(instanceErrorListener).toHaveBeenCalledTimes(1)
})
