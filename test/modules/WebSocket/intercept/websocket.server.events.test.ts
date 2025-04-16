// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket'
import { getWsUrl } from '../utils/getWsUrl'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('emits a MessageEvent on incoming server message', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hi from server')
  })

  const serverMessageListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', serverMessageListener)
  })

  const clientMessageListener = vi.fn()
  const ws = new WebSocket(getWsUrl(wsServer))
  ws.onmessage = (event) => clientMessageListener(event)

  // Must dispatch the correct incoming server MessageEvent.
  await vi.waitFor(() => {
    expect(serverMessageListener).toHaveBeenCalledTimes(1)
    const event = serverMessageListener.mock.calls[0][0] as MessageEvent

    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hi from server')
    expect(event.origin).toBe(getWsUrl(wsServer))
    expect(event.cancelable).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  // Must dispatch the correct received client MessageEvent.
  await vi.waitFor(() => {
    expect(clientMessageListener).toBeCalledTimes(1)

    const event = clientMessageListener.mock.calls[0][0] as MessageEvent
    expect(event).toBeInstanceOf(MessageEvent)
    expect(event.type).toBe('message')
    expect(event.data).toBe('hi from server')
    expect(event.origin).toBe(getWsUrl(wsServer))
  })
})

it('prevents the default server-to-client message forwarding', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hi from server')
  })

  const serverMessageListener = vi.fn()
  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', (event) => {
      event.preventDefault()
      serverMessageListener()
    })
  })

  const clientMessageListener = vi.fn()
  const ws = new WebSocket(getWsUrl(wsServer))
  ws.onmessage = (event) => clientMessageListener(event)

  await vi.waitFor(() => {
    expect(serverMessageListener).toHaveBeenCalledTimes(1)
    expect(clientMessageListener).not.toHaveBeenCalled()
  })
})
