// @vitest-environment node-with-websocket
import { vi, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
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
  const serverSocketPromise = new DeferredPromise<WebSocket>()

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    serverSocketPromise.resolve(server.socket)

    client.addEventListener('message', (event) => {
      if (event.data === 'close') {
        event.preventDefault()
        return client.close()
      }
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  ws.addEventListener('open', () => {
    ws.send('close')
  })
  ws.addEventListener('close', (event) => clientClosePromise.resolve(event))

  await clientClosePromise
  const serverSocket = await serverSocketPromise

  expect(ws.readyState).toBe(WebSocket.CLOSED)
  expect(serverSocket.readyState).toBe(WebSocket.CLOSING)
})

it('throw an error when connecting to a non-existing server', async () => {
  interceptor.once('connection', ({ server }) => {
    server.connect()
  })

  const errorListener = vi.fn()
  const ws = new WebSocket('ws://localhost:9876')
  ws.onerror = errorListener

  await vi.waitFor(() => {
    expect(errorListener).toHaveBeenCalledTimes(1)
  })
})

it('inherits the "binaryType" from the mock WebSocket', async () => {
  const clientMessageListener = vi.fn<(buffer: ArrayBuffer) => void>()
  const interceptorMessageListener = vi.fn<(buffer: ArrayBuffer) => void>()

  wsServer.on('connection', (ws) => {
    // Set the "binaryType" for the "ws" package also
    // so it sends ArrayBuffer and not internal "nodebuffer".
    ws.binaryType = 'arraybuffer'
    ws.send(new TextEncoder().encode('hello'))
  })

  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('message', (event) => {
      interceptorMessageListener(event.data as ArrayBuffer)
    })
  })

  const ws = new WebSocket(getWsUrl(wsServer))
  // Set a custom binary type for this socket instance.
  ws.binaryType = 'arraybuffer'
  ws.onmessage = (event) => clientMessageListener(event.data)

  await vi.waitFor(() => {
    const interceptorData = interceptorMessageListener.mock.calls[0][0]
    expect(new TextDecoder().decode(interceptorData)).toBe('hello')

    const clientData = clientMessageListener.mock.calls[0][0]
    expect(new TextDecoder().decode(clientData)).toBe('hello')
  })
})
