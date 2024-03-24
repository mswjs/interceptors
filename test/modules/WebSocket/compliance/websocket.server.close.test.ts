/**
 * @vitest-environment node-with-websocket
 */
import { DeferredPromise } from '@open-draft/deferred-promise'
import { RawData } from 'engine.io-parser'
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { WebSocketInterceptor } from '../../../../src/interceptors/WebSocket/index'
import { getWsUrl } from '../utils/getWsUrl'
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
  wsServer.clients.forEach((client) => client.close())
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('closes the actual server connection when called "server.close()"', async () => {
  const clientOpenPromise = new DeferredPromise<void>()
  const serverCallback = vi.fn<[number]>()
  const clientMessageListener = vi.fn<[RawData]>()

  wsServer.on('connection', (client) => {
    client.addEventListener('message', (event) => {
      clientMessageListener(event.data)
    })
  })

  interceptor.on('connection', ({ client, server }) => {
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
  ws.onopen = () => clientOpenPromise.resolve()
  ws.onerror = () => clientOpenPromise.reject()
  await clientOpenPromise

  // Must forward the client messages to the original server.
  ws.send('hello from client')
  await vi.waitFor(() => {
    expect(clientMessageListener).toHaveBeenCalledWith('hello from client')
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
  expect(clientMessageListener).not.toHaveBeenCalledWith('another hello')
})
