import {
  WebSocketInterceptor,
  WebSocketServerConnection,
} from '@mswjs/interceptors/WebSocket'
import { setTimeout } from '#/test/setup/helpers-neutral'
import { getTestServer } from '#/test/setup/vitest'
import { waitForWebSocketEvent } from '../utils/waitForWebSocketEvent'

const testServer = getTestServer()
const interceptor = new WebSocketInterceptor()

beforeAll(() => {
  interceptor.apply()
})

afterEach(() => {
  interceptor.removeAllListeners()
})

afterAll(() => {
  interceptor.dispose()
})

it('throws if closing the unconnected server', async () => {
  const serverPromise = Promise.withResolvers<WebSocketServerConnection>()
  interceptor.once('connection', ({ server }) => {
    serverPromise.resolve(server)
  })

  new WebSocket('wss://example.com')
  const server = await serverPromise.promise

  expect(() => server.close()).toThrow(
    `Failed to close server connection for "wss://example.com/": the connection is not open. Did you forget to call "server.connect()"?`
  )
})

it('closes the actual server connection when called "server.close()"', async () => {
  const serverCallback = vi.fn<(input: number) => void>()

  interceptor.once('connection', ({ client, server }) => {
    server.connect()
    serverCallback(server.socket.readyState)

    server.socket.addEventListener('close', () => {
      serverCallback(server.socket.readyState)
    })

    client.addEventListener('message', (event) => {
      if (event.data === 'close-server') {
        event.preventDefault()
        server.close()
      }
    })
  })

  // The actual server echoes the received messages.
  const echoListener = vi.fn<(data: string) => void>()
  const ws = new WebSocket(testServer.ws.url('/?echo'))
  ws.onmessage = (event) => echoListener(event.data)
  await waitForWebSocketEvent('open', ws)

  // Must forward the client messages to the original server.
  ws.send('hello from client')
  await vi.waitFor(() => {
    expect(echoListener).toHaveBeenCalledWith('hello from client')
  })

  // Must close the server connection once "server.close()" is called.
  ws.send('close-server')
  await vi.waitFor(() => {
    expect(serverCallback).toHaveBeenLastCalledWith(WebSocket.CLOSED)
  })

  // Must not forward the client messages to the original server
  // after the connection has been closed.
  ws.send('another hello')
  await setTimeout(100)
  expect(echoListener).not.toHaveBeenCalledWith('another hello')
})

it('resumes forwarding client events to the server once it is reconnected', async () => {
  interceptor.once('connection', ({ client, server }) => {
    server.connect()

    client.addEventListener('message', (event) => {
      switch (event.data) {
        case 'server/close': {
          event.preventDefault()
          server.close()
          break
        }

        case 'server/reconnect': {
          event.preventDefault()
          server.connect()
          break
        }
      }
    })
  })

  // The actual server echoes the received messages.
  const echoListener = vi.fn<(data: string) => void>()
  const ws = new WebSocket(testServer.ws.url('/?echo'))
  ws.onmessage = (event) => echoListener(event.data)
  await waitForWebSocketEvent('open', ws)

  ws.send('first hello')
  await vi.waitFor(() => {
    expect(echoListener).toHaveBeenLastCalledWith('first hello')
  })

  ws.send('server/close')
  await setTimeout(100)
  ws.send('second hello')
  await setTimeout(100)
  expect(echoListener).not.toHaveBeenCalledWith('second hello')

  ws.send('server/reconnect')
  await setTimeout(100)
  ws.send('third hello')
  await vi.waitFor(() => {
    expect(echoListener).toHaveBeenLastCalledWith('third hello')
  })
})

it('forwards "close" events from the original server', async () => {
  const interceptorServerCloseListener = vi.fn()

  interceptor.once('connection', ({ server }) => {
    server.connect()
    server.addEventListener('close', (event) => {
      interceptorServerCloseListener(event.code, event.reason)
    })
  })

  // The actual server closes every connection with a custom code.
  const clientCloseListener = vi.fn()
  const ws = new WebSocket(
    testServer.ws.url('/?close=1003,Cannot process payload')
  )
  ws.onclose = (event) => clientCloseListener(event.code, event.reason)

  // Must forward the original close event to the interceptor.
  await vi.waitFor(() => {
    expect(interceptorServerCloseListener).toHaveBeenCalledWith(
      1003,
      'Cannot process payload'
    )
  })

  // Must forward the original close to the intercepted client.
  await vi.waitFor(() => {
    expect(clientCloseListener).toHaveBeenCalledWith(
      1003,
      'Cannot process payload'
    )
  })
})
