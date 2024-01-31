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

/**
 * @fixme Once "ws" stops polyfilling "Event".
 */
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
    client.on('message', (event) => server.send(event.data))
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

/**
 * @fixme Once again, the "ws" custom Error issue.
 */
it.skip('closes the actual server connection when the client closes', async () => {
  const clientClosePromise = new DeferredPromise<CloseEvent>()
  const serverClosePromise = new DeferredPromise<CloseEvent>()

  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    server.on('close', serverClosePromise.resolve)
    client.on('message', (event) => {
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
  ws.onclose = clientClosePromise.resolve

  await clientClosePromise
  expect(ws.readyState).toBe(WebSocket.CLOSED)

  expect(await serverClosePromise).toMatchObject({
    type: 'close',
    code: 1000,
    reason: '',
    wasClean: true,
  })
})
