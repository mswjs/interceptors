/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { WebSocketInterceptor } from '../../../../../src/interceptors/WebSocket'
import { getWsUrl } from '../../utils/getWsUrl'

const interceptor = new WebSocketInterceptor()

const wsServer = new WebSocketServer({
  host: '127.0.0.1',
  port: 0,
})

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  wsServer.clients.forEach((client) => client.close(1000))
  wsServer.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it.skip('forwards incoming server data from the original server', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hello from server')
  })

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const messageReceivedPromise = new DeferredPromise<string>()
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })

  expect(await messageReceivedPromise).toBe('hello from server')
})

it.skip('forwards outgoing client data to the original server', async () => {
  wsServer.once('connection', (ws) => {
    ws.on('message', (data) => {
      ws.send(`Hello, ${data}!`)
    })
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    client.on('message', (event) => {
      server.send(event.data)
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const messageReceivedPromise = new DeferredPromise<string>()
  ws.addEventListener('open', () => {
    ws.send('John')
  })
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event.data)
  })

  expect(await messageReceivedPromise).toBe('Hello, John!')
})
