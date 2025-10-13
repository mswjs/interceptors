/**
 * @vitest-environment node-with-websocket
 * This test suite asserts that the intercepted WebSocket client
 * still dispatches the correct events in mocked/bypassed scenarios.
 */
import { vi, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { getWsUrl } from '../utils/getWsUrl'
import { sleep } from '../../../helpers'

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  vi.restoreAllMocks()
  interceptor.removeAllListeners()
  wsServer.removeAllListeners()
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('emits "open" event when mocked connection is opened', async () => {
  /**
   * @note At least one "connection" listener has to be added
   * in order for the WebSocket connections to be mock-first.
   */
  interceptor.once('connection', () => {})

  const ws = new WebSocket('wss://localhost')
  const openListener = vi.fn()
  ws.onopen = openListener

  await vi.waitFor(() => {
    expect(openListener).toHaveBeenCalledTimes(1)
  })

  const [openEvent] = openListener.mock.calls[0]
  expect(openEvent.type).toBe('open')
  expect(openEvent.target).toBe(ws)
  expect(openEvent.currentTarget).toBe(ws)
})

it('emits "open" event when original connection is opened', async () => {
  const ws = new WebSocket(getWsUrl(wsServer))
  const openListener = vi.fn()
  ws.onopen = openListener

  await vi.waitFor(() => {
    expect(openListener).toHaveBeenCalledTimes(1)
  })

  const [openEvent] = openListener.mock.calls[0]
  expect(openEvent.type).toBe('open')
  expect(openEvent.target).toBe(ws)
  expect(openEvent.currentTarget).toBe(ws)
})

it('emits "message" event on incoming mock server data', async () => {
  interceptor.once('connection', ({ client }) => {
    client.send('hello')
  })

  const ws = new WebSocket('wss://localhost')
  const messageListener = vi.fn()
  ws.onmessage = messageListener

  await vi.waitFor(() => {
    expect(messageListener).toHaveBeenCalledTimes(1)
  })

  const [messageEvent] = messageListener.mock.calls[0]
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello')
  expect(messageEvent.target).toBe(ws)
  expect(messageEvent.currentTarget).toBe(ws)
  expect(messageEvent.origin).toBe(ws.url)
})

it('emits "message" event on incoming original server data', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hello')
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const messageListener = vi.fn()
  ws.onmessage = messageListener

  await vi.waitFor(() => {
    expect(messageListener).toHaveBeenCalledTimes(1)
  })

  const [messageEvent] = messageListener.mock.calls[0]
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello')
  expect(messageEvent.target).toBe(ws)
  expect(messageEvent.currentTarget).toBe(ws)
  expect(messageEvent.origin).toBe(ws.url)
})

it('emits "close" event when the mocked client closes the connection', async () => {
  interceptor.once('connection', () => {})

  const ws = new WebSocket('wss://localhost')
  const closeListener = vi.fn()
  ws.onclose = closeListener
  /**
   * @note Closing the connection before it has been open
   * results in an error.
   */
  ws.onopen = () => ws.close()

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)
})

it('emits "close" event when the original server closes the connection', async () => {
  wsServer.once('connection', (ws) => {
    ws.close(1000)
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const closeListener = vi.fn()
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)
})

it('emits "close" event when the interceptor gracefully closes the connection', async () => {
  interceptor.once('connection', ({ client }) => {
    queueMicrotask(() => client.close())
  })

  const ws = new WebSocket('wss://localhost')
  const closeListener = vi.fn()
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1000)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)
})

it('emits "close" event when the interceptor closes the connection with error code', async () => {
  interceptor.once('connection', ({ client }) => {
    client.close(3000, 'Oops!')
  })

  const closeEventPromise = new DeferredPromise<CloseEvent>()

  const ws = new WebSocket('wss://localhost')
  ws.onclose = closeEventPromise.resolve

  const closeEvent = await closeEventPromise
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(3000)
  expect(closeEvent.reason).toBe('Oops!')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)
})

it('emits "close" event when the original server closes the connection with error code', async () => {
  wsServer.once('connection', (ws) => {
    ws.close(1003, 'Server reason')
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const closeListener = vi.fn()
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1003)
  expect(closeEvent.reason).toBe('Server reason')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)
})

it('emits "error" event on passthrough client connection failure', async () => {
  // Connecting to a non-existing server URL without any
  // interceptor listener MUST establish the connection as-is
  // (no "open" event; "error" event; no "close" event).
  const ws = new WebSocket('wss://localhost/non-existing-url')

  const openListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  ws.onopen = openListener
  ws.onerror = errorListener
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalledTimes(1)
  })

  expect(ws.readyState).toBe(ws.CLOSED)
  expect(openListener).not.toHaveBeenCalled()
  /**
   * @note The update in `ws` makes it dispatch the "close" event
   * if the handshake receives a network error (or non-101 response).
   */
  expect(closeListener).toHaveBeenCalledOnce()
})

it('allows erroring the connection in a synchronous listener', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  interceptor.once('connection', () => {
    throw new Error('mock error')
  })

  const ws = new WebSocket('wss://localhost/non-existing-url')

  const openListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  ws.onopen = openListener
  ws.onerror = errorListener
  ws.onclose = closeListener

  await expect.poll(() => errorListener).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'error',
    })
  )

  await expect.poll(() => ws.readyState).toBe(ws.CLOSED)
  expect(openListener).not.toHaveBeenCalled()
  expect(closeListener).toHaveBeenCalledOnce()
  expect(closeListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'close',
      code: 1011,
      reason: 'mock error',
    })
  )
})

it('allows erroring the connection from an asynchronous listener', async ({
  onTestFinished,
}) => {
  vi.spyOn(console, 'error').mockImplementation(() => {})

  interceptor.once('connection', async () => {
    await sleep(200)
    throw new Error('mock error')
  })

  const ws = new WebSocket('wss://localhost/non-existing-url')

  const openListener = vi.fn()
  const errorListener = vi.fn()
  const closeListener = vi.fn()
  ws.onopen = openListener
  ws.onerror = errorListener
  ws.onclose = closeListener

  await expect.poll(() => errorListener).toHaveBeenCalledTimes(1)
  expect(errorListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'error',
    })
  )

  await expect.poll(() => ws.readyState).toBe(ws.CLOSED)
  expect(openListener).not.toHaveBeenCalled()
  expect(closeListener).toHaveBeenCalledOnce()
  expect(closeListener).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'close',
      code: 1011,
      reason: 'mock error',
    })
  )
})

it('does not emit "error" event on mocked error code closures', async () => {
  interceptor.once('connection', ({ client }) => {
    /**
     * @note Closing the connection with non-configurable code
     * does NOT result in the "error" event.
     */
    client.close(1003)
  })

  const ws = new WebSocket('wss://localhost')

  const errorListener = vi.fn()
  const closeListener = vi.fn()
  ws.onerror = errorListener
  ws.onclose = closeListener

  await vi.waitFor(() => {
    expect(closeListener).toHaveBeenCalledTimes(1)
  })

  const [closeEvent] = closeListener.mock.calls[0]
  expect(closeEvent.type).toBe('close')
  expect(closeEvent.code).toBe(1003)
  expect(closeEvent.reason).toBe('')
  expect(closeEvent.wasClean).toBe(true)
  expect(closeEvent.target).toBe(ws)
  expect(closeEvent.currentTarget).toBe(ws)

  expect(errorListener).not.toHaveBeenCalled()
})
