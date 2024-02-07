/**
 * @vitest-environment node-with-websocket
 * @see https://websockets.spec.whatwg.org/#dom-websocket-send
 */
import { it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { RawData, WebSocketServer } from 'ws'
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
})

afterAll(() => {
  interceptor.dispose()
  wsServer.close()
})

it('throws "InvalidStateError" when sending while the connection is not open yet', () => {
  const ws = new WebSocket('wss://example.com')
  expect(() => {
    ws.send('hello')
  }).toThrow('InvalidStateError')
})

/**
 * @fixme The same "instanceof" issue with "ws".
 * It implements its own "Event" class so Node "dispatchEvent"
 * throws on that.
 */
it.skip('sends text data to the original server', async () => {
  const messagePromise = new DeferredPromise<RawData>()

  wsServer.once('connection', (ws) => {
    ws.on('message', (data) => messagePromise.resolve(data))
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    client.addEventListener('message', (event) => server.send(event.data))
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send('hello')
    expect(ws.bufferedAmount).toBe(5)
  })

  expect(await messagePromise).toBe('hello')
  expect(ws.bufferedAmount).toBe(0)
})

it.skip('sends Blob data to the original server', async () => {
  const messagePromise = new DeferredPromise<RawData>()

  wsServer.once('connection', (ws) => {
    ws.on('message', (data) => messagePromise.resolve(data))
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    client.addEventListener('message', (event) => server.send(event.data))
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send(new Blob(['hello']))
    expect(ws.bufferedAmount).toBe(5)
  })

  expect(await messagePromise).toEqual(new Blob(['hello']))
  expect(ws.bufferedAmount).toBe(0)
})

it.skip('sends ArrayBuffer data to the original server', async () => {
  const messagePromise = new DeferredPromise<RawData>()

  wsServer.once('connection', (ws) => {
    ws.on('message', (data) => messagePromise.resolve(data))
  })

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    client.addEventListener('message', (event) => server.send(event.data))
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  expect(ws.bufferedAmount).toBe(0)

  ws.addEventListener('open', () => {
    ws.send(new TextEncoder().encode('hello'))
    expect(ws.bufferedAmount).toBe(5)
  })

  expect(await messagePromise).toEqual(new TextEncoder().encode('hello'))
  expect(ws.bufferedAmount).toBe(0)
})
