/**
 * @vitest-environment node-with-websocket
 */
import { DeferredPromise } from '@open-draft/deferred-promise'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer, Data } from 'ws'
import {
  WebSocketInterceptor,
  WebSocketServerConnection,
} from '../../../../src/interceptors/WebSocket/index'
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

afterEach(() => {
  interceptor.removeAllListeners()
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('throws if closing the unconnected server', async () => {
  const serverPromise = new DeferredPromise<WebSocketServerConnection>()
  interceptor.once('connection', ({ server }) => {
    serverPromise.resolve(server)
  })

  new WebSocket('wss://example.com')
  const server = await serverPromise

  expect(() => server.close()).toThrow(
    `Failed to close server connection for "wss://example.com": the connection is not open. Did you forget to call "server.connect()"?`
  )
})

it('closes the actual server connection when called "server.close()"', async () => {
  const serverCallback = vi.fn<[number]>()
  const originalClientMessageListener = vi.fn<[Data]>()

  wsServer.on('connection', (client) => {
    client.addEventListener('message', (event) => {
      originalClientMessageListener(event.data)
    })
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    serverCallback(server.readyState)

    client.addEventListener('message', (event) => {
      server.send(event.data)
    })

    /**
     * @fixme Tapping into internals isn't nice.
     */
    server['realWebSocket']?.addEventListener('close', () => {
      serverCallback(server.readyState)
    })

    client.addEventListener('message', (event) => {
      if (event.data === 'close-server') {
        server.close()
      }
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  await waitForWebSocketEvent('open', ws)

  // Must forward the client messages to the original server.
  ws.send('hello from client')
  await vi.waitFor(() => {
    expect(originalClientMessageListener).toHaveBeenCalledWith(
      'hello from client'
    )
  })

  // Must close the server connection once "server.close()" is called.
  ws.send('close-server')
  await vi.waitFor(() => {
    expect(serverCallback).toHaveBeenLastCalledWith(WebSocket.CLOSED)
  })

  // Must not forward the client messages to the original server
  // after the connection has been closed.
  ws.send('another hello')
  await waitForNextTick()
  expect(originalClientMessageListener).not.toHaveBeenCalledWith(
    'another hello'
  )
})

it('resumes forwarding client events to the server once it is reconnected', async () => {
  const originalClientMessageListener = vi.fn<[Data]>()
  wsServer.on('connection', (client) => {
    client.addEventListener('message', (event) => {
      originalClientMessageListener(event.data)
    })
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    client.addEventListener('message', (event) => {
      if (event.data === 'server/close') {
        server.close()
      }

      if (event.data === 'server/reconnect') {
        server.connect()
      }

      server.send(event.data)
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  await waitForWebSocketEvent('open', ws)

  ws.send('first hello')
  await vi.waitFor(() => {
    expect(originalClientMessageListener).toHaveBeenLastCalledWith(
      'first hello'
    )
  })

  ws.send('server/close')
  await waitForNextTick()
  ws.send('second hello')
  await vi.waitFor(() => {
    expect(originalClientMessageListener).not.toHaveBeenCalledWith(
      'second hello'
    )
  })

  ws.send('server/reconnect')
  await waitForNextTick()
  ws.send('third hello')
  await vi.waitFor(() => {
    expect(originalClientMessageListener).toHaveBeenLastCalledWith(
      'third hello'
    )
  })
})
