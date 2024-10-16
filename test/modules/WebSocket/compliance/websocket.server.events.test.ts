// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { getWsUrl } from '../utils/getWsUrl'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'
import { waitForNextTick } from '../utils/waitForNextTick'

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

  const client = new WebSocket(getWsUrl(wsServer))
  expect(client.readyState).toBe(WebSocket.CONNECTING)

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })

  expect(client.readyState).toBe(WebSocket.OPEN)
})

it('emits "open" event if the listener was added before calling "connect()"', async () => {
  const serverOpenListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.addEventListener('open', serverOpenListener)

    server.connect()
  })

  const client = new WebSocket(getWsUrl(wsServer))
  expect(client.readyState).toBe(WebSocket.CONNECTING)

  await vi.waitFor(() => {
    expect(serverOpenListener).toHaveBeenCalledTimes(1)
  })

  expect(client.readyState).toBe(WebSocket.OPEN)
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

  const client = new WebSocket(getWsUrl(wsServer))
  expect(client.readyState).toBe(WebSocket.CONNECTING)

  await vi.waitFor(() => {
    expect(serverCloseListener).toHaveBeenCalledTimes(1)
  })

  expect(client.readyState).toBe(WebSocket.CLOSED)
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

  const client = new WebSocket(getWsUrl(wsServer))
  expect(client.readyState).toBe(WebSocket.CONNECTING)

  await vi.waitFor(() => {
    expect(serverCloseListener).toHaveBeenCalledTimes(1)
  })

  /**
   * @note Unlike receiving the "close" event from the original server,
   * closing the real server connection via `server.close()` has NO effect
   * on the client. It will remain open.
   */
  expect(client.readyState).toBe(WebSocket.OPEN)

  const [closeEvent] = serverCloseListener.mock.calls[0]
  expect(closeEvent).toHaveProperty('code', 1000)
  expect(closeEvent).toHaveProperty('reason', '')

  expect(serverErrorListener).not.toHaveBeenCalled()
})

/**
 * There's a bug in Undici that doesn't dispatch the "close" event upon "error" event.
 * Unskip this test once that bug is resolved.
 * @see https://github.com/nodejs/undici/issues/3697
 */
it.skip('emits both "error" and "close" events when the server connection errors', async () => {
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
  const client = new WebSocket('wss://example.com/non-existing-url')
  expect(client.readyState).toBe(WebSocket.CONNECTING)

  const instanceErrorListener = vi.fn()
  const instanceCloseListener = vi.fn()
  client.addEventListener('error', instanceErrorListener)
  client.addEventListener('close', instanceCloseListener)

  await vi.waitFor(() => {
    expect(serverCloseListener).toHaveBeenCalledTimes(1)
  })

  expect(client.readyState).toBe(WebSocket.CLOSING)

  await waitForNextTick()
  expect(client.readyState).toBe(WebSocket.CLOSED)

  // Must emit the "error" event.
  expect(instanceErrorListener).toHaveBeenCalledOnce()

  // Must emit the "close" event because:
  // - The connection closed due to an error (non-existing host).
  // - The "close" event wasn't prevented.
  expect(serverCloseListener).toHaveBeenCalledOnce()
  expect(clientCloseListener).toHaveBeenCalledOnce()
  expect(instanceCloseListener).toHaveBeenCalledOnce()
})

it('prevents "error" event forwarding by calling "event.preventDefault()', async () => {
  interceptor.once('connection', ({ server, client }) => {
    server.connect()
    server.addEventListener('error', (event) => {
      expect(event.defaultPrevented).toBe(false)
      event.preventDefault()
      expect(event.defaultPrevented).toBe(true)

      process.nextTick(() => client.close())
    })
  })

  const client = new WebSocket('wss://non-existing-host.com/intentional')
  const instanceErrorListener = vi.fn()
  client.addEventListener('error', instanceErrorListener)

  await waitForWebSocketEvent('close', client)

  expect(instanceErrorListener).not.toHaveBeenCalled()
})

it('prevents "close" event forwarding by calling "event.preventDefault()"', async () => {
  wsServer.once('connection', (ws) => {
    ws.close(1003, 'Server reason')
  })

  interceptor.once('connection', ({ server, client }) => {
    server.connect()
    server.addEventListener('close', (event) => {
      expect(event.defaultPrevented).toBe(false)
      event.preventDefault()
      expect(event.defaultPrevented).toBe(true)
    })
  })

  const client = new WebSocket(getWsUrl(wsServer))
  const closeListener = vi.fn()
  const errorListener = vi.fn()
  client.addEventListener('close', closeListener)
  client.addEventListener('error', errorListener)

  await waitForWebSocketEvent('open', client)

  const closePromise = vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
    return closeListener.mock.calls.length
  })

  await expect(closePromise).rejects.toThrow()
  expect(errorListener).not.toHaveBeenCalled()
})
