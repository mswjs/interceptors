/**
 * @vitest-environment node-with-websocket
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'
import { DeferredPromise } from '@open-draft/deferred-promise'
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

afterEach(() => {
  wsServer.clients.forEach((client) => client.close(1000))
  wsServer.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('forwards incoming server data from the original server', async () => {
  wsServer.once('connection', (ws) => {
    ws.send('hello from server')
  })

  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('hello from server')
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})

it('forwards outgoing client data to the original server', async () => {
  wsServer.once('connection', (ws) => {
    ws.on('message', (data) => {
      ws.send(`Hello, ${data}!`)
    })
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    client.addEventListener('message', (event) => server.send(event.data))
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  const messageReceivedPromise = new DeferredPromise<MessageEvent>()
  ws.addEventListener('open', () => {
    ws.send('John')
  })
  ws.addEventListener('message', (event) => {
    messageReceivedPromise.resolve(event)
  })

  const messageEvent = await messageReceivedPromise
  expect(messageEvent.type).toBe('message')
  expect(messageEvent.data).toBe('Hello, John!')
  expect(messageEvent.origin).toBe(ws.url)
  expect(messageEvent.target).toEqual(ws)
})

it('closes the actual server connection when the client closes', async () => {
  const clientClosePromise = new DeferredPromise<CloseEvent>()
  let realWebSocket: WebSocket | undefined

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    realWebSocket = server['realWebSocket']

    client.addEventListener('message', (event) => {
      if (event.data === 'close') {
        return client.close()
      }
      server.send(event.data)
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  ws.addEventListener('open', () => {
    ws.send('close')
  })
  ws.addEventListener('close', (event) => clientClosePromise.resolve(event))

  await clientClosePromise
  expect(ws.readyState).toBe(WebSocket.CLOSED)
  expect(realWebSocket?.readyState).toBe(WebSocket.CLOSING)
})
